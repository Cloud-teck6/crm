import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../../common/types/auth-user';
import { parseCsvObjects } from '../../common/util/csv-parse';
import { toCsv } from '../../common/util/csv';

const TARGET_FIELDS: Record<string, string[]> = {
  Lead: ['firstName', 'lastName', 'email', 'phone', 'company', 'source', 'campaign', 'status'],
  Contact: ['firstName', 'lastName', 'email', 'phone'],
  Account: ['name', 'domain', 'industry'],
};

const ALIASES: Record<string, string[]> = {
  firstName: ['firstname', 'first', 'fname', 'givenname'],
  lastName: ['lastname', 'last', 'lname', 'surname', 'familyname'],
  email: ['email', 'emailaddress', 'mail'],
  phone: ['phone', 'phonenumber', 'mobile', 'mobilenumber', 'contact'],
  company: ['company', 'companyname', 'organization', 'organisation', 'business'],
  name: ['name', 'accountname', 'companyname'],
  domain: ['domain', 'website', 'url'],
  industry: ['industry', 'sector'],
  source: ['source', 'leadsource'],
  campaign: ['campaign', 'utmcampaign'],
  status: ['status', 'stage'],
};

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const CHUNK = 50;

@Injectable()
export class ImportsService {
  private readonly logger = new Logger(ImportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Parse headers + a few sample rows, and suggest a column mapping. */
  preview(objectType: string, csv: string) {
    this.assertObject(objectType);
    const { headers, rows } = parseCsvObjects(csv);
    if (headers.length === 0) throw new BadRequestException('CSV has no header row');
    return {
      headers,
      sample: rows.slice(0, 5),
      totalRows: rows.length,
      targetFields: TARGET_FIELDS[objectType],
      suggestedMapping: this.suggestMapping(headers, objectType),
    };
  }

  async start(
    user: AuthUser,
    dto: { objectType: string; csv: string; mapping: Record<string, string>; dedupeStrategy?: string },
  ) {
    this.assertObject(dto.objectType);
    const strategy = dto.dedupeStrategy ?? 'skip';
    if (!['skip', 'update', 'create'].includes(strategy)) throw new BadRequestException('Invalid dedupe strategy');
    const { rows } = parseCsvObjects(dto.csv);

    const job = await this.prisma.client.importJob.create({
      data: {
        objectType: dto.objectType,
        status: 'PENDING',
        dedupeStrategy: strategy,
        mapping: dto.mapping as any,
        total: rows.length,
        createdById: user.id,
      } as any,
    });
    await this.audit.log({ action: 'import.start', resource: 'ImportJob', resourceId: job.id, after: { objectType: dto.objectType, total: rows.length } });

    // Process in the background (tenant-explicit; outside request context).
    void this.process(job.id, user.tenantId, dto.objectType, dto.mapping, strategy, rows);
    return job;
  }

  async status(id: string) {
    const job = await this.prisma.client.importJob.findFirst({ where: { id } });
    if (!job) throw new NotFoundException('Import job not found');
    return job;
  }

  async errorsCsv(id: string): Promise<string> {
    const job = await this.status(id);
    const errors = (job.errors as any[]) ?? [];
    return toCsv(errors.length ? errors : [{ row: '', reason: 'no errors' }], ['row', 'reason']);
  }

  list() {
    return this.prisma.client.importJob.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
  }

  // ── Background processing ────────────────────────────────────────────────
  private async process(
    jobId: string,
    tenantId: string,
    objectType: string,
    mapping: Record<string, string>,
    strategy: string,
    rows: Record<string, string>[],
  ) {
    await this.prisma.client.importJob.updateMany({ where: { id: jobId }, data: { status: 'PROCESSING' } });
    const counts = { processed: 0, created: 0, updated: 0, skipped: 0, failed: 0 };
    const errors: Array<{ row: number; reason: string }> = [];

    for (let i = 0; i < rows.length; i++) {
      try {
        const data = this.mapRow(rows[i], mapping);
        const validation = this.validate(objectType, data);
        if (validation) {
          counts.failed++;
          if (errors.length < 500) errors.push({ row: i + 2, reason: validation }); // +2: header + 1-index
        } else {
          const outcome = await this.writeRecord(tenantId, objectType, data, strategy);
          counts[outcome]++;
        }
      } catch (err: any) {
        counts.failed++;
        if (errors.length < 500) errors.push({ row: i + 2, reason: err.message });
      }
      counts.processed++;

      if (counts.processed % CHUNK === 0) {
        await this.prisma.client.importJob.updateMany({ where: { id: jobId }, data: { ...counts, errors: errors as any } });
      }
    }

    await this.prisma.client.importJob.updateMany({
      where: { id: jobId },
      data: { ...counts, errors: errors as any, status: 'COMPLETED' },
    });
    this.logger.log(`Import ${jobId} complete: ${JSON.stringify(counts)}`);
  }

  private mapRow(row: Record<string, string>, mapping: Record<string, string>) {
    const data: Record<string, any> = { customFields: {} };
    for (const [csvCol, target] of Object.entries(mapping)) {
      if (!target) continue;
      const value = row[csvCol];
      if (value === undefined || value === '') continue;
      if (target.startsWith('customFields.')) data.customFields[target.slice('customFields.'.length)] = value;
      else data[target] = value;
    }
    return data;
  }

  private validate(objectType: string, data: any): string | null {
    if (data.email && !EMAIL_RE.test(data.email)) return `invalid email "${data.email}"`;
    if (objectType === 'Account') {
      if (!data.name) return 'missing required field: name';
    } else if (!data.email && !data.phone && !data.firstName && !data.lastName) {
      return 'row has no email, phone or name';
    }
    return null;
  }

  private async writeRecord(tenantId: string, objectType: string, data: any, strategy: string): Promise<'created' | 'updated' | 'skipped'> {
    const email = data.email ? String(data.email).toLowerCase() : null;
    const phone = data.phone ?? null;
    const model = this.modelFor(objectType);

    if (objectType !== 'Account' && (email || phone) && strategy !== 'create') {
      const or: any[] = [];
      if (email) or.push({ email });
      if (phone) or.push({ phone });
      const existing = await (model as any).findFirst({ where: { tenantId, deletedAt: null, OR: or } });
      if (existing) {
        if (strategy === 'skip') return 'skipped';
        await (model as any).updateMany({ where: { id: existing.id, tenantId }, data: this.recordData(objectType, data, email) });
        return 'updated';
      }
    }
    await (model as any).create({ data: { tenantId, ...this.recordData(objectType, data, email) } });
    return 'created';
  }

  private recordData(objectType: string, data: any, email: string | null) {
    const base: any = { customFields: data.customFields ?? {} };
    if (objectType === 'Account') {
      base.name = data.name;
      base.domain = data.domain ?? null;
      base.industry = data.industry ?? null;
    } else {
      base.firstName = data.firstName ?? null;
      base.lastName = data.lastName ?? null;
      base.email = email;
      base.phone = data.phone ?? null;
    }
    if (objectType === 'Lead') {
      base.company = data.company ?? null;
      base.source = data.source ?? 'import';
      base.campaign = data.campaign ?? null;
      if (data.status && ['NEW', 'CONTACTED', 'QUALIFIED', 'UNQUALIFIED', 'CONVERTED'].includes(String(data.status).toUpperCase())) {
        base.status = String(data.status).toUpperCase();
      }
    }
    return base;
  }

  private modelFor(objectType: string) {
    return objectType === 'Lead' ? this.prisma.client.lead : objectType === 'Contact' ? this.prisma.client.contact : this.prisma.client.account;
  }

  private suggestMapping(headers: string[], objectType: string): Record<string, string> {
    const fields = TARGET_FIELDS[objectType];
    const map: Record<string, string> = {};
    for (const h of headers) {
      const norm = h.toLowerCase().replace(/[^a-z0-9]/g, '');
      const match = fields.find((f) => (ALIASES[f] ?? [f.toLowerCase()]).some((a) => a === norm));
      map[h] = match ?? '';
    }
    return map;
  }

  private assertObject(objectType: string) {
    if (!TARGET_FIELDS[objectType]) throw new BadRequestException(`Unsupported import object: ${objectType}`);
  }
}
