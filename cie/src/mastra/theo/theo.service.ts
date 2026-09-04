import { BadRequestException, Injectable } from '@nestjs/common';
import { theoRequestSchema } from './diagnostic-input';
import { runTheo } from './runner';

@Injectable()
export class TheoService {
  async diagnose(input: unknown) {
    const request = theoRequestSchema.safeParse(input);

    if (!request.success) {
      throw new BadRequestException({
        message: 'Invalid Theo request.',
        issues: request.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }

    const result = await runTheo({ request: request.data });

    return {
      ...result,
      suggestedPromptChange: result.diagnosis.proposed_edit,
    };
  }
}
