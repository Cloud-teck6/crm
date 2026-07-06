import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../../common/types/auth-user';

const REDACTED = '[redacted]';

/**
 * DPDP (India) / GDPR data-subject tooling: export everything held about a
 * person, or erase/anonymize it. Admin-only (settings:manage).
 */
@Injectable()
export class ComplianceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async exportData(user: AuthUser, email: string) {
    const e = this.normalize(email);
    const [contacts, leads] = await Promise.all([
      this.prisma.client.contact.findMany({ where: { email: e } }),
      this.prisma.client.lead.findMany({ where: { email: e } }),
    ]);
    const ids = { contactIds: contacts.map((c) => c.id), leadIds: leads.map((l) => l.id) };
    const [messages, calls, activities] = await Promise.all([
      this.prisma.client.message.findMany({ where: { OR: [{ contactId: { in: ids.contactIds } }, { leadId: { in: ids.leadIds } }] } }),
      this.prisma.client.call.findMany({ where: { OR: [{ contactId: { in: ids.contactIds } }, { leadId: { in: ids.leadIds } }] } }),
      this.prisma.client.activity.findMany({ where: { OR: [{ contactId: { in: ids.contactIds } }, { leadId: { in: ids.leadIds } }] } }),
    ]);
    await this.audit.log({ action: 'compliance.export', resource: 'Compliance', after: { email: e, contacts: contacts.length, leads: leads.length } });
    return { email: e, exportedAt: new Date().toISOString(), contacts, leads, messages, calls, activities };
  }

  async deleteData(user: AuthUser, email: string) {
    const e = this.normalize(email);
    if (!e) throw new BadRequestException('email required');

    const [contacts, leads] = await Promise.all([
      this.prisma.client.contact.findMany({ where: { email: e }, select: { id: true } }),
      this.prisma.client.lead.findMany({ where: { email: e }, select: { id: true } }),
    ]);
    const contactIds = contacts.map((c) => c.id);
    const leadIds = leads.map((l) => l.id);
    const now = new Date();
    // Clear customFields too — ingested leads/contacts store form answers (PII)
    // there; rawPayload (the raw inbound submission) must be JsonNull, not
    // `undefined` (which Prisma treats as "leave unchanged").
    const anon = { firstName: REDACTED, lastName: null, email: null, phone: null, customFields: {}, deletedAt: now };

    const [c, l, m, ca, ac] = await Promise.all([
      this.prisma.client.contact.updateMany({ where: { email: e }, data: anon as any }),
      this.prisma.client.lead.updateMany({ where: { email: e }, data: { ...anon, company: null, rawPayload: Prisma.JsonNull } as any }),
      this.prisma.client.message.updateMany({ where: { OR: [{ contactId: { in: contactIds } }, { leadId: { in: leadIds } }] }, data: { body: REDACTED, fromAddress: REDACTED, toAddress: REDACTED } }),
      this.prisma.client.call.updateMany({ where: { OR: [{ contactId: { in: contactIds } }, { leadId: { in: leadIds } }] }, data: { fromNumber: REDACTED, toNumber: REDACTED, notes: null } }),
      this.prisma.client.activity.updateMany({ where: { OR: [{ contactId: { in: contactIds } }, { leadId: { in: leadIds } }] }, data: { deletedAt: now } }),
    ]);

    await this.audit.log({ action: 'compliance.delete', resource: 'Compliance', after: { email: e, contacts: c.count, leads: l.count } });
    return { email: e, erased: { contacts: c.count, leads: l.count, messages: m.count, calls: ca.count, activities: ac.count } };
  }

  private normalize(email: string): string {
    return (email ?? '').trim().toLowerCase();
  }
}
