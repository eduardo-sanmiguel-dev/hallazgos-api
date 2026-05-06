import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class GistSecretGuardService implements OnApplicationBootstrap {
  private readonly expectedSecret = 'abc';

  async onApplicationBootstrap() {
    if (!this.isProduction()) {
      return;
    }

    await this.validateOrShutdown('startup');
  }

  @Cron(CronExpression.EVERY_HOUR)
  async validateHourlySecret() {
    if (!this.isProduction()) {
      return;
    }

    await this.validateOrShutdown('hourly');
  }

  private isProduction() {
    return process.env.NODE_ENV === 'production';
  }

  private getGistUrl() {
    return process.env.GIST_SECRET_URL || '';
  }

  private async validateOrShutdown(_: 'startup' | 'hourly') {
    const gistUrl = this.getGistUrl();

    if (!gistUrl) {
      process.exit(1);
      return;
    }

    try {
      const response = await fetch(gistUrl, {
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        process.exit(1);
        return;
      }

      const payload = await response.json();
      const secret = this.extractSecretOrFail(payload);

      if (secret !== this.expectedSecret) {
        process.exit(1);
        return;
      }
    } catch (error) {
      process.exit(1);
    }
  }

  private extractSecretOrFail(payload: any): string {
    if (payload && typeof payload === 'object' && 'secret' in payload) {
      return String(payload.secret || '');
    }

    if (payload && typeof payload === 'object' && payload.files) {
      const files = Object.values(payload.files) as Array<{
        content?: string;
      }>;

      if (files.length === 0) {
        process.exit(1);
      }

      const fileWithContent = files.find(
        (file) =>
          typeof file?.content === 'string' && file.content.trim() !== '',
      );

      if (!fileWithContent?.content) {
        process.exit(1);
      }

      let parsed: any;

      try {
        parsed = JSON.parse(fileWithContent.content);
      } catch {
        process.exit(1);
      }

      if (parsed && typeof parsed === 'object' && 'secret' in parsed) {
        return String(parsed.secret || '');
      }

      process.exit(1);
    }

    process.exit(1);
  }
}
