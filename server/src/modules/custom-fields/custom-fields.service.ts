import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CustomFieldType } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateCustomFieldDto, UpdateCustomFieldDto } from './dto/custom-fields.dto';

@Injectable()
export class CustomFieldsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(objectType?: string) {
    return this.prisma.client.customField.findMany({
      where: { deletedAt: null, ...(objectType ? { objectType } : {}) },
      orderBy: [{ objectType: 'asc' }, { order: 'asc' }],
    });
  }

  async create(dto: CreateCustomFieldDto) {
    const existing = await this.prisma.client.customField.findFirst({
      where: { objectType: dto.objectType, apiName: dto.apiName, deletedAt: null },
    });
    if (existing) throw new BadRequestException('A field with that apiName already exists on this object');

    const field = await this.prisma.client.customField.create({
      data: {
        objectType: dto.objectType,
        name: dto.name,
        apiName: dto.apiName,
        type: dto.type,
        required: dto.required ?? false,
        options: dto.options ?? [],
        order: dto.order ?? 0,
      } as any,
    });
    await this.audit.log({ action: 'custom_field.create', resource: 'CustomField', resourceId: field.id, after: { objectType: field.objectType, apiName: field.apiName } });
    return field;
  }

  async update(id: string, dto: UpdateCustomFieldDto) {
    const res = await this.prisma.client.customField.updateMany({
      where: { id, deletedAt: null },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.required !== undefined ? { required: dto.required } : {}),
        ...(dto.options !== undefined ? { options: dto.options } : {}),
        ...(dto.order !== undefined ? { order: dto.order } : {}),
      },
    });
    if (res.count === 0) throw new NotFoundException('Custom field not found');
    await this.audit.log({ action: 'custom_field.update', resource: 'CustomField', resourceId: id });
    return this.prisma.client.customField.findFirst({ where: { id } });
  }

  async remove(id: string) {
    const res = await this.prisma.client.customField.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (res.count === 0) throw new NotFoundException('Custom field not found');
    await this.audit.log({ action: 'custom_field.delete', resource: 'CustomField', resourceId: id });
    return { ok: true };
  }

  /**
   * Validates and normalizes a record's customFields jsonb against the field
   * definitions for an object. Rejects unknown keys and missing required
   * fields; light type coercion. Returns the cleaned object.
   */
  async validateValues(
    objectType: string,
    values: Record<string, unknown> | undefined,
  ): Promise<Record<string, unknown>> {
    const defs = await this.prisma.client.customField.findMany({
      where: { objectType, deletedAt: null },
    });
    const byKey = new Map(defs.map((d) => [d.apiName, d]));
    const input = values ?? {};

    for (const key of Object.keys(input)) {
      if (!byKey.has(key)) {
        throw new BadRequestException(`Unknown custom field "${key}" on ${objectType}`);
      }
    }

    const out: Record<string, unknown> = {};
    for (const def of defs) {
      const raw = input[def.apiName];
      const present = raw !== undefined && raw !== null && raw !== '';
      if (!present) {
        if (def.required) throw new BadRequestException(`Custom field "${def.apiName}" is required`);
        continue;
      }
      out[def.apiName] = this.coerce(def.type, raw, def.apiName);
    }
    return out;
  }

  /**
   * Merge incoming custom-field values over the record's existing values, then
   * validate/normalize. Used by PATCH so a partial update never drops fields
   * the caller didn't mention. Unknown keys in the INCOMING patch are rejected;
   * stale keys already stored (for a since-deleted field) are silently dropped.
   */
  async mergeAndValidate(
    objectType: string,
    existing: Record<string, unknown> | null | undefined,
    incoming: Record<string, unknown> | undefined,
  ): Promise<Record<string, unknown>> {
    const defs = await this.prisma.client.customField.findMany({
      where: { objectType, deletedAt: null },
    });
    const byKey = new Map(defs.map((d) => [d.apiName, d]));
    for (const key of Object.keys(incoming ?? {})) {
      if (!byKey.has(key)) throw new BadRequestException(`Unknown custom field "${key}" on ${objectType}`);
    }
    const merged = { ...(existing ?? {}), ...(incoming ?? {}) };
    const out: Record<string, unknown> = {};
    for (const def of defs) {
      const raw = merged[def.apiName];
      const present = raw !== undefined && raw !== null && raw !== '';
      if (!present) {
        if (def.required) throw new BadRequestException(`Custom field "${def.apiName}" is required`);
        continue;
      }
      out[def.apiName] = this.coerce(def.type, raw, def.apiName);
    }
    return out;
  }

  private coerce(type: CustomFieldType, value: unknown, key: string): unknown {
    switch (type) {
      case CustomFieldType.NUMBER: {
        const n = Number(value);
        if (Number.isNaN(n)) throw new BadRequestException(`"${key}" must be a number`);
        return n;
      }
      case CustomFieldType.BOOLEAN:
        return value === true || value === 'true';
      case CustomFieldType.MULTISELECT:
        return Array.isArray(value) ? value : [value];
      default:
        return value;
    }
  }
}
