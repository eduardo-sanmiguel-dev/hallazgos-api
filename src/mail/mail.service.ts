import { MailerService } from '@nestjs-modules/mailer';
import { join } from 'path';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  durantionToTime,
  stringToDateWithTime,
} from '../shared/utils/index.js';
import { Evidence } from '../evidences/entities/evidence.entity.js';
import { ENV_DEVELOPMENT } from '../shared/constants/index.js';
import { priorityLabel } from '../shared/constants/priority.js';
import { User } from '../users/entities/user.entity.js';
import {
  LOGO_ATTACHMENTS,
  MAIL_THEMES,
  type MailThemeName,
  dateTile,
  deadlineTile,
  evidenceDetails,
  evidenceSteps,
  mailTheme,
  photosView,
  preheader,
  priorityTile,
  resolutionTile,
  textTile,
  tileRow,
} from './mail.view.js';

// Carpeta local de imágenes (src/mail o dist/mail → <proyecto>/public/...).
// Antes se armaba como __dirname + '../../../public/...' (sin separador):
// "dist/mail../../../public" solo funciona en Windows, que normaliza la ruta;
// en Linux la carpeta "mail.." no existe y el adjunto fallaba.
export const LOCAL_EVIDENCE_IMAGES_DIR = join(
  import.meta.dirname,
  '..',
  '..',
  'public',
  'static',
  'images',
  'evidences',
);

/** Adjuntos locales en todos los entornos: las URLs de imágenes exigen sesión. */
const localImagePath = (fileName: string) => {
  if (!/^[^\\/\0]+$/.test(fileName))
    throw new Error('Nombre de imagen no válido');
  return join(LOCAL_EVIDENCE_IMAGES_DIR, fileName);
};

// Mismo mapeo que el dashboard (shared/constants/priority).
const getPriorityLabel = priorityLabel;

const getRemainingDays = (
  createdAt?: Date | null,
  priorityDays?: number | null,
) => {
  if (!createdAt || !priorityDays) return '';
  const dueDate = new Date(createdAt);
  dueDate.setDate(dueDate.getDate() + priorityDays);
  const now = new Date();
  const diffMs = dueDate.getTime() - now.getTime();
  return `${Math.ceil(diffMs / (1000 * 60 * 60 * 24))}`;
};

const formatDayLabel = (days: number) =>
  `${days} ${Math.abs(days) === 1 ? 'día' : 'días'}`;

// Same rule as the UI: partial days count as a full day, and it is on time
// when it was closed within createdAt + priorityDays.
const getResolution = (
  createdAt?: Date | null,
  solutionDate?: Date | null,
  priorityDays?: number | null,
) => {
  if (!createdAt || !solutionDate) return null;

  const diffMs =
    new Date(solutionDate).getTime() - new Date(createdAt).getTime();

  if (Number.isNaN(diffMs)) return null;

  const days = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

  if (!priorityDays) {
    return { daysLabel: formatDayLabel(days), statusLabel: '', isOnTime: true };
  }

  const isOnTime = days <= priorityDays;

  return {
    daysLabel: formatDayLabel(days),
    statusLabel: isOnTime
      ? 'En tiempo'
      : `Fuera de tiempo (${formatDayLabel(days - priorityDays)})`,
    isOnTime,
  };
};

// Separados con coma, como en los detalles del correo (antes " / ").
const names = (users: User[]) => users.map(({ name }) => name).join(', ');

type ImageField = 'imgEvidence' | 'imgProcess' | 'imgSolution';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  private MAIL_USER_APP: string = '';
  private FRONTEND_URL: string = '';
  private readonly environment: string;
  private readonly pathImage: (fileName: string) => string;

  constructor(
    private readonly mailerService: MailerService,
    private readonly configService: ConfigService,
  ) {
    this.MAIL_USER_APP = this.configService.get<string>('email.user');
    this.FRONTEND_URL = this.configService.get<string>('frontendUrl');
    this.environment = this.configService.get<string>('environment');
    this.pathImage = localImagePath;
  }

  get emailTest() {
    if (this.environment === ENV_DEVELOPMENT) {
      return 'eduardo-266@hotmail.com';
    }
    return '';
  }

  /** Remitente con el nombre del sistema y el aviso: "ComportArte (…)". */
  private sender(notice: string) {
    return `"ComportArte (${notice})" <${this.MAIL_USER_APP}>`;
  }

  /**
   * Mismo asunto en todos los avisos de un hallazgo: el cliente de correo los
   * agrupa en una conversación (antes era "Planta - Criterio" y mezclaba
   * hallazgos distintos). El aviso se distingue por el remitente.
   */
  private subject(evidence: Evidence) {
    return `Hallazgo #${evidence.id} · ${evidence.manufacturingPlant.name} - ${evidence.mainType.name}`;
  }

  /**
   * Detalle del hallazgo en la UI (botón "Ver hallazgo"). Sin FRONTEND_URL
   * válida, vacío: la plantilla omite el botón.
   */
  private viewUrl(evidence: Evidence) {
    try {
      return new URL(
        `/hallazgos?evidenceId=${evidence.id}`,
        this.FRONTEND_URL,
      ).toString();
    } catch {
      return '';
    }
  }

  /** Fotos del hallazgo que existen, como adjuntos en línea (CID). */
  private imageAttachments(evidence: Evidence, fields: ImageField[]) {
    return fields
      .filter((field) => !!evidence[field])
      .map((field) => ({
        filename: evidence[field],
        path: this.pathImage(evidence[field]),
        cid: field,
      }));
  }

  /** Datos comunes de los avisos de un hallazgo (encabezado, seguimiento, detalles). */
  private evidenceContext(
    evidence: Evidence,
    themeName: MailThemeName,
    cancelled?: { at: string; by: string },
  ) {
    const theme = mailTheme(
      themeName,
      `Hallazgos · ${evidence.manufacturingPlant.name}`,
      // Reasignar no cambia el estatus: se ve con el color del actual.
      themeName === 'reassign' ? evidence.status : undefined,
    );

    return {
      year: new Date().getFullYear(),
      theme,
      title: `Hallazgo #${evidence.id}`,
      subtitle: `${evidence.mainType.name} · ${evidence.secondaryType.name}`,
      id: evidence.id,
      manufacturingPlant: evidence.manufacturingPlant.name,
      mainType: evidence.mainType.name,
      secondaryType: evidence.secondaryType.name,
      zone: evidence.zone.name,
      descripcion: evidence.description || '',
      userWhoCreated: evidence.user.name,
      createdAt: stringToDateWithTime(evidence.createdAt),
      supervisor: names(evidence.supervisors),
      priorityLabel: getPriorityLabel(evidence.priorityDays),
      remainingDays: getRemainingDays(
        evidence.createdAt,
        evidence.priorityDays,
      ),
      viewUrl: this.viewUrl(evidence),
      steps: evidenceSteps(evidence, theme.accent, cancelled),
      details: evidenceDetails(evidence),
    };
  }

  private evidencePhoto(evidence: Evidence) {
    return evidence.imgEvidence
      ? {
          cid: 'imgEvidence',
          caption: 'Hallazgo',
          color: MAIL_THEMES.create.accent,
        }
      : null;
  }

  /**
   * Foto del hallazgo y, si ya pasó por "En progreso", la del avance
   * (reasignado y cancelado: el hallazgo puede estar en cualquiera).
   */
  private progressPhotos(evidence: Evidence) {
    return photosView(evidence.imgProcess ? 'Antes y avance' : 'Evidencia', [
      this.evidencePhoto(evidence),
      this.processPhoto(evidence),
    ]);
  }

  /** Foto con la que se pasó a "En progreso" (avance). */
  private processPhoto(evidence: Evidence) {
    return evidence.imgProcess
      ? {
          cid: 'imgProcess',
          caption: 'Avance',
          color: MAIL_THEMES.inProgress.accent,
        }
      : null;
  }

  async sendCreate({
    user,
    evidenceCurrent,
  }: {
    user: User;
    evidenceCurrent: Evidence;
  }) {
    this.logger.debug(
      `Sending create email to ${user.email} for evidence ID ${evidenceCurrent.id}`,
    );

    const base = this.evidenceContext(evidenceCurrent, 'create');

    await this.mailerService
      .sendMail({
        to: this.emailTest || user.email,
        from: this.sender('hallazgo creado'),
        subject: this.subject(evidenceCurrent),
        template: './create',
        context: {
          ...base,
          preheader: preheader(
            `${base.userWhoCreated} reportó en ${base.zone}: ${base.descripcion}`,
          ),
          tiles: tileRow([
            ['Prioridad', priorityTile(evidenceCurrent.priorityDays)],
            ['Plazo', deadlineTile(base.remainingDays)],
            ['Registrado', dateTile(evidenceCurrent.createdAt)],
          ]),
          ...photosView('Evidencia', [this.evidencePhoto(evidenceCurrent)]),
        },
        attachments: [
          ...this.imageAttachments(evidenceCurrent, ['imgEvidence']),
          ...LOGO_ATTACHMENTS,
        ],
      })
      .catch((error) => {
        this.logger.error(
          `Failed to send create email to ${user.email} for evidence ID ${evidenceCurrent.id}: ${error.message}`,
        );
      });
  }

  async sendReassign({
    user,
    reassignedBy,
    evidenceCurrent,
    previousResponsibles,
    currentResponsibles,
  }: {
    user: User;
    reassignedBy: User;
    evidenceCurrent: Evidence;
    previousResponsibles: User[];
    currentResponsibles: User[];
  }) {
    const base = this.evidenceContext(evidenceCurrent, 'reassign');
    const current =
      currentResponsibles.length > 0
        ? names(currentResponsibles)
        : 'Sin responsables asignados';

    await this.mailerService.sendMail({
      to: this.emailTest || user.email,
      from: this.sender('hallazgo reasignado'),
      subject: this.subject(evidenceCurrent),
      template: './reassign',
      context: {
        ...base,
        preheader: preheader(
          `${reassignedBy.name} lo reasignó. Ahora a cargo: ${current}`,
        ),
        reassignedBy: reassignedBy.name,
        previousResponsibles:
          previousResponsibles.length > 0
            ? names(previousResponsibles)
            : 'Sin responsables previos',
        currentResponsibles: current,
        reassignedAt: stringToDateWithTime(new Date()),
        tiles: tileRow([
          ['Prioridad', priorityTile(evidenceCurrent.priorityDays)],
          ['Plazo', deadlineTile(base.remainingDays)],
          ['Registrado', dateTile(evidenceCurrent.createdAt)],
        ]),
        ...this.progressPhotos(evidenceCurrent),
      },
      attachments: [
        ...this.imageAttachments(evidenceCurrent, [
          'imgEvidence',
          'imgProcess',
        ]),
        ...LOGO_ATTACHMENTS,
      ],
    });
  }

  async sendSolution({
    user,
    evidenceCurrent,
  }: {
    user: User;
    evidenceCurrent: Evidence;
  }) {
    const resolution = getResolution(
      evidenceCurrent.createdAt,
      evidenceCurrent.solutionDate,
      evidenceCurrent.priorityDays,
    );
    const base = this.evidenceContext(evidenceCurrent, 'solution');
    const closedBy = evidenceCurrent.closedBy?.name || '';

    await this.mailerService.sendMail({
      to: this.emailTest || user.email,
      from: this.sender('hallazgo solucionado'),
      subject: this.subject(evidenceCurrent),
      template: './solution',
      context: {
        ...base,
        preheader: preheader(
          [
            `Solucionado${resolution ? ` en ${resolution.daysLabel}` : ''}`,
            resolution?.statusLabel,
            evidenceCurrent.descriptionSolution,
          ]
            .filter(Boolean)
            .join(' · '),
        ),
        descripcionSolucion: evidenceCurrent.descriptionSolution || '',
        // Quién lo inició y quién lo cerró (vacío en hallazgos anteriores a
        // que se registrara; la plantilla lo omite).
        startedBy: evidenceCurrent.startedBy?.name || '',
        startProcessDate: evidenceCurrent.startProcessDate
          ? stringToDateWithTime(evidenceCurrent.startProcessDate)
          : '',
        closedBy,
        solutionDate: stringToDateWithTime(evidenceCurrent.solutionDate),
        durantionToTime: durantionToTime(
          evidenceCurrent.createdAt,
          evidenceCurrent.solutionDate,
        ),
        resolutionDays: resolution?.daysLabel || '',
        resolutionStatus: resolution?.statusLabel || '',
        resolutionOnTime: resolution?.isOnTime ?? true,
        tiles: tileRow([
          ['Resuelto en', resolutionTile(resolution)],
          ['Prioridad', priorityTile(evidenceCurrent.priorityDays)],
          ['Solucionado', dateTile(evidenceCurrent.solutionDate)],
        ]),
        // Hallazgo, avance (si pasó por "En progreso") y solución.
        ...photosView(
          evidenceCurrent.imgProcess
            ? 'Antes, avance y después'
            : 'Antes y después',
          [
            this.evidencePhoto(evidenceCurrent),
            this.processPhoto(evidenceCurrent),
            evidenceCurrent.imgSolution
              ? {
                  cid: 'imgSolution',
                  caption: 'Solución',
                  color: MAIL_THEMES.solution.accent,
                }
              : null,
          ],
        ),
      },
      attachments: [
        ...this.imageAttachments(evidenceCurrent, [
          'imgEvidence',
          'imgProcess',
          'imgSolution',
        ]),
        ...LOGO_ATTACHMENTS,
      ],
    });
  }

  async sendInProgress({
    user,
    startedBy,
    evidenceCurrent,
  }: {
    user: User;
    startedBy: User;
    evidenceCurrent: Evidence;
  }) {
    // Quien lo inició es quien hizo la petición, aunque la entidad no lo traiga.
    const evidence = { ...evidenceCurrent, startedBy } as Evidence;
    const base = this.evidenceContext(evidence, 'inProgress');

    await this.mailerService.sendMail({
      to: this.emailTest || user.email,
      from: this.sender('hallazgo en progreso'),
      subject: this.subject(evidence),
      template: './in-progress',
      context: {
        ...base,
        preheader: preheader(
          `${startedBy.name} comenzó a atender el hallazgo que reportaste en ${base.zone}`,
        ),
        startedBy: startedBy.name,
        startProcessDate: stringToDateWithTime(evidence.startProcessDate),
        tiles: tileRow([
          ['Prioridad', priorityTile(evidence.priorityDays)],
          ['Plazo', deadlineTile(base.remainingDays)],
          ['Inicio', dateTile(evidence.startProcessDate)],
        ]),
        ...photosView('Antes y avance', [
          this.evidencePhoto(evidence),
          this.processPhoto(evidence),
        ]),
      },
      attachments: [
        ...this.imageAttachments(evidence, ['imgEvidence', 'imgProcess']),
        ...LOGO_ATTACHMENTS,
      ],
    });
  }

  async sendCancel({
    cancelledBy,
    user,
    evidenceCurrent,
  }: {
    cancelledBy: User;
    user: User;
    evidenceCurrent: Evidence;
  }) {
    const now = new Date();
    const cancelledAt = stringToDateWithTime(now);
    const base = this.evidenceContext(evidenceCurrent, 'cancel', {
      at: cancelledAt,
      by: cancelledBy.name,
    });

    await this.mailerService.sendMail({
      to: this.emailTest || user.email,
      from: this.sender('hallazgo cancelado'),
      subject: this.subject(evidenceCurrent),
      template: './cancel',
      context: {
        ...base,
        preheader: preheader(
          `${cancelledBy.name} canceló el hallazgo. Ya no requiere seguimiento.`,
        ),
        cancelledByName: cancelledBy.name,
        cancelledAt,
        tiles: tileRow([
          ['Cancelado por', textTile(cancelledBy.name)],
          ['Cancelado', dateTile(now)],
          ['Registrado', dateTile(evidenceCurrent.createdAt)],
        ]),
        ...this.progressPhotos(evidenceCurrent),
      },
      attachments: [
        ...this.imageAttachments(evidenceCurrent, [
          'imgEvidence',
          'imgProcess',
        ]),
        ...LOGO_ATTACHMENTS,
      ],
    });
  }

  async sendForgotPassword(email: string, token: string) {
    await this.mailerService.sendMail({
      to: this.emailTest || email,
      from: this.sender('restablecimiento de contraseña'),
      subject: 'Restablecimiento de contraseña',
      template: './forgot-password',
      context: {
        year: new Date().getFullYear(),
        theme: mailTheme('account', 'ComportArte · Tu cuenta'),
        title: 'Restablece tu contraseña',
        subtitle: 'Solicitud para cambiar tu contraseña',
        preheader: preheader(
          'Usa el botón para crear una nueva contraseña. El enlace vence en 5 minutos.',
        ),
        token,
        resetLink: `${this.FRONTEND_URL}?token=${token}`,
        tiles: tileRow([
          ['Vence en', textTile('5 minutos', 'Después pide un enlace nuevo')],
          [
            '¿No fuiste tú?',
            textTile('Ignora este correo', 'Tu contraseña no cambia'),
          ],
        ]),
      },
      attachments: LOGO_ATTACHMENTS,
    });
  }
}
