import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreatePipelineDto, UpdatePipelineDto, StageInputDto, UpdateStageDto } from './dto/pipelines.dto';

const DEFAULT_STAGES: StageInputDto[] = [
  { name: 'New', probability: 10 },
  { name: 'Contacted', probability: 25 },
  { name: 'Qualified', probability: 50 },
  { name: 'Proposal', probability: 70 },
  { name: 'Won', probability: 100, isWon: true },
  { name: 'Lost', probability: 0, isLost: true },
];

@Injectable()
export class PipelinesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.client.pipeline.findMany({
      where: { deletedAt: null },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      include: { stages: { orderBy: { order: 'asc' } } },
    });
  }

  async get(id: string) {
    const pipeline = await this.prisma.client.pipeline.findFirst({
      where: { id, deletedAt: null },
      include: { stages: { orderBy: { order: 'asc' } } },
    });
    if (!pipeline) throw new NotFoundException('Pipeline not found');
    return pipeline;
  }

  async create(dto: CreatePipelineDto) {
    const pipeline = await this.prisma.client.pipeline.create({
      data: { name: dto.name, isDefault: dto.isDefault ?? false } as any,
    });
    const stages = (dto.stages?.length ? dto.stages : DEFAULT_STAGES).map((s, i) => ({
      pipelineId: pipeline.id,
      name: s.name,
      order: s.order ?? i + 1,
      probability: s.probability ?? 0,
      isWon: s.isWon ?? false,
      isLost: s.isLost ?? false,
      rotDays: s.rotDays ?? null,
    }));
    await this.prisma.client.stage.createMany({ data: stages as any });
    await this.audit.log({ action: 'pipeline.create', resource: 'Pipeline', resourceId: pipeline.id, after: { name: pipeline.name } });
    return this.get(pipeline.id);
  }

  async update(id: string, dto: UpdatePipelineDto) {
    const res = await this.prisma.client.pipeline.updateMany({
      where: { id, deletedAt: null },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.isDefault !== undefined ? { isDefault: dto.isDefault } : {}),
      },
    });
    if (res.count === 0) throw new NotFoundException('Pipeline not found');
    await this.audit.log({ action: 'pipeline.update', resource: 'Pipeline', resourceId: id });
    return this.get(id);
  }

  async remove(id: string) {
    const deals = await this.prisma.client.deal.count({ where: { pipelineId: id, deletedAt: null } });
    if (deals > 0) throw new BadRequestException('Move or delete deals before deleting this pipeline');
    const res = await this.prisma.client.pipeline.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (res.count === 0) throw new NotFoundException('Pipeline not found');
    await this.audit.log({ action: 'pipeline.delete', resource: 'Pipeline', resourceId: id });
    return { ok: true };
  }

  // ── Stages ──────────────────────────────────────────────────────────────
  async addStage(pipelineId: string, dto: StageInputDto) {
    await this.get(pipelineId); // existence
    const count = await this.prisma.client.stage.count({ where: { pipelineId } });
    const stage = await this.prisma.client.stage.create({
      data: {
        pipelineId,
        name: dto.name,
        order: dto.order ?? count + 1,
        probability: dto.probability ?? 0,
        isWon: dto.isWon ?? false,
        isLost: dto.isLost ?? false,
        rotDays: dto.rotDays ?? null,
      } as any,
    });
    await this.audit.log({ action: 'stage.create', resource: 'Stage', resourceId: stage.id });
    return stage;
  }

  async updateStage(stageId: string, dto: UpdateStageDto) {
    const res = await this.prisma.client.stage.updateMany({
      where: { id: stageId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.order !== undefined ? { order: dto.order } : {}),
        ...(dto.probability !== undefined ? { probability: dto.probability } : {}),
        ...(dto.isWon !== undefined ? { isWon: dto.isWon } : {}),
        ...(dto.isLost !== undefined ? { isLost: dto.isLost } : {}),
        ...(dto.rotDays !== undefined ? { rotDays: dto.rotDays } : {}),
      },
    });
    if (res.count === 0) throw new NotFoundException('Stage not found');
    await this.audit.log({ action: 'stage.update', resource: 'Stage', resourceId: stageId });
    return this.prisma.client.stage.findFirst({ where: { id: stageId } });
  }

  async removeStage(stageId: string) {
    const deals = await this.prisma.client.deal.count({ where: { stageId, deletedAt: null } });
    if (deals > 0) throw new BadRequestException('Move deals out of this stage first');
    const res = await this.prisma.client.stage.deleteMany({ where: { id: stageId } });
    if (res.count === 0) throw new NotFoundException('Stage not found');
    await this.audit.log({ action: 'stage.delete', resource: 'Stage', resourceId: stageId });
    return { ok: true };
  }
}
