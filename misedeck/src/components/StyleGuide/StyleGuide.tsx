// StyleGuide — in-app gallery page that renders every base component
// (and the foundational tokens) in both languages. Used to verify the
// visual system derived from mise.jdx.dev (rewritten in #37).
// Not a real Storybook — just a dev surface:
// internal design documentation, routed only in dev builds (#36), so
// it carries its own back link instead of the product navigation.

import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { I18N_KEYS } from "../../i18n/keys";

import {
  Badge,
  Banner,
  Button,
  DataRow,
  EmptyState,
  IconButton,
  Panel,
  ProgressDot,
  Table,
  type TableColumn,
} from "..";

import styles from "./StyleGuide.module.css";

interface ToolRow {
  id: string;
  tool: string;
  backend: string;
  current: string;
  latest: string;
  source: string;
}

const TOOL_ROWS: ToolRow[] = [
  { id: "node", tool: "node", backend: "core", current: "22.11.0", latest: "22.20.0", source: "global config" },
  { id: "python", tool: "python", backend: "core", current: "3.13.7", latest: "—", source: "global config" },
  { id: "go", tool: "go", backend: "core", current: "1.23.2", latest: "1.25.1", source: "~/code/api/mise.toml" },
  { id: "ripgrep", tool: "ripgrep", backend: "cargo", current: "14.1.1", latest: "—", source: "global config" },
];

interface Swatch {
  name: string;
  token: string;
}

const SWATCHES: Swatch[] = [
  { name: "void", token: "var(--void)" },
  { name: "hull", token: "var(--hull)" },
  { name: "beam", token: "var(--beam)" },
  { name: "ice", token: "var(--ice)" },
  { name: "flare", token: "var(--flare)" },
  { name: "breach", token: "var(--breach)" },
  { name: "grove", token: "var(--grove)" },
  { name: "text", token: "var(--text)" },
  { name: "dim", token: "var(--dim)" },
  { name: "panel", token: "var(--panel)" },
  { name: "line", token: "var(--line)" },
  { name: "line-strong", token: "var(--line-strong)" },
  { name: "beam-soft", token: "var(--beam-soft)" },
];

export function StyleGuide() {
  const { t } = useTranslation();

  const toolColumns: TableColumn<ToolRow>[] = [
    {
      key: "tool",
      header: t(I18N_KEYS.styleguide.samples.tableTool),
      cell: (r) => <span className={styles.cellName}>{r.tool}</span>,
    },
    {
      key: "backend",
      header: t(I18N_KEYS.styleguide.samples.tableBackend),
      cell: (r) => <Badge variant="info" data>{r.backend}</Badge>,
    },
    {
      key: "current",
      header: t(I18N_KEYS.styleguide.samples.tableCurrent),
      cell: (r) => <span className={styles.cellMono}>{r.current}</span>,
      numeric: true,
    },
    {
      key: "latest",
      header: t(I18N_KEYS.styleguide.samples.tableLatest),
      cell: (r) => (
        <span className={styles.cellLatest}>
          {r.latest !== "—" ? (
            <>
              <span>22.11.0</span>
              <span className={styles.arrow}>▹</span>
              <span className={styles.latestValue}>{r.latest}</span>
            </>
          ) : (
            <span className={styles.dim}>—</span>
          )}
        </span>
      ),
      numeric: true,
    },
    {
      key: "source",
      header: t(I18N_KEYS.styleguide.samples.tableSource),
      cell: (r) => <span className={styles.cellSource}>{r.source}</span>,
    },
    {
      key: "actions",
      header: t(I18N_KEYS.styleguide.samples.tableActions),
      cell: () => (
        <span className={styles.cellActions}>
          <Button size="sm" variant="ghost">
            Versions ▾
          </Button>
          <IconButton size="sm" variant="ghost" aria-label="more">
            ⋯
          </IconButton>
        </span>
      ),
    },
  ];

  return (
    <div className={styles.page}>
      <Link to="/" className={styles.backLink} data-testid="styleguide-back">
        {t(I18N_KEYS.styleguide.backToHome)}
      </Link>
      <header className={styles.head}>
        <div className={styles.eyebrow}>{t(I18N_KEYS.styleguide.eyebrow)}</div>
        <h1 className={styles.title}>{t(I18N_KEYS.styleguide.title)}</h1>
        <p className={styles.intro}>
          {t(I18N_KEYS.styleguide.notes.color)}
        </p>
      </header>


      {/* ---------- Color ---------- */}
      <Section
        eyebrow="01"
        title={t(I18N_KEYS.styleguide.sections.color)}
        note={t(I18N_KEYS.styleguide.notes.color)}
      >
        <div className={styles.swatchGrid}>
          {SWATCHES.map((s) => (
            <div key={s.name} className={styles.swatch}>
              <div
                className={styles.swatchChip}
                style={{ background: s.token }}
                aria-hidden="true"
              />
              <div className={styles.swatchMeta}>
                <span className={styles.swatchName}>{s.name}</span>
                <span className={styles.swatchToken}>{s.token}</span>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ---------- Typography ---------- */}
      <Section
        eyebrow="02"
        title={t(I18N_KEYS.styleguide.sections.typography)}
        note={t(I18N_KEYS.styleguide.notes.typography)}
      >
        <div className={styles.typeStack}>
          <div className={styles.typeRow}>
            <span className={styles.typeLabel}>DISPLAY / 22</span>
            <span className={styles.typeDisplay}>TOOLS</span>
          </div>
          <div className={styles.typeRow}>
            <span className={styles.typeLabel}>UI / 14</span>
            <span className={styles.typeUi}>
              Run a tool, set a version, trust a config.
            </span>
          </div>
          <div className={styles.typeRow}>
            <span className={styles.typeLabel}>DATA / 12</span>
            <span className={styles.typeMono}>22.11.0 ▹ 22.20.0</span>
          </div>
          <div className={styles.typeRow}>
            <span className={styles.typeLabel}>LABEL / 10</span>
            <span className={styles.typeLabelSample}>MISE / TOOLS</span>
          </div>
        </div>
      </Section>

      {/* ---------- Motion ---------- */}
      <Section
        eyebrow="03"
        title={t(I18N_KEYS.styleguide.sections.motion)}
        note={t(I18N_KEYS.styleguide.notes.motion)}
      >
        <div className={styles.motionGrid}>
          <div className={styles.motionItem}>
            <span className={styles.motionLabel}>PULSE · 1.6s</span>
            <div className={styles.motionRow}>
              <ProgressDot tone="flare" title="attention" />
              <ProgressDot tone="breach" title="error" />
              <ProgressDot tone="grove" title="ready" />
              <ProgressDot tone="dim" title="idle" />
            </div>
          </div>
          <div className={styles.motionItem}>
            <span className={styles.motionLabel}>CARET BLINK · 1.1s</span>
            <div className={styles.motionRow}>
              <span className={styles.caret} aria-hidden="true" />
              <span className={styles.motionCode}>$ mise use -g node@latest</span>
            </div>
          </div>
        </div>
      </Section>

      {/* ---------- Panel ---------- */}
      <Section
        eyebrow="04"
        title={t(I18N_KEYS.styleguide.sections.panel)}
        note={t(I18N_KEYS.styleguide.notes.panel)}
      >
        <div className={styles.panelGrid}>
          <Panel>
            <div className={styles.demoLabel}>
              {t(I18N_KEYS.styleguide.samples.panelDefault)}
            </div>
            <p className={styles.demoBody}>{t(I18N_KEYS.styleguide.notes.panel)}</p>
          </Panel>
          <Panel tone="info">
            <div className={styles.demoLabel}>
              {t(I18N_KEYS.styleguide.samples.panelInfo)}
            </div>
            <p className={styles.demoBody}>{t(I18N_KEYS.styleguide.notes.panel)}</p>
          </Panel>
          <Panel tone="warning">
            <div className={styles.demoLabel}>
              {t(I18N_KEYS.styleguide.samples.panelWarning)}
            </div>
            <p className={styles.demoBody}>{t(I18N_KEYS.styleguide.notes.panel)}</p>
          </Panel>
          <Panel tone="danger">
            <div className={styles.demoLabel}>
              {t(I18N_KEYS.styleguide.samples.panelDanger)}
            </div>
            <p className={styles.demoBody}>{t(I18N_KEYS.styleguide.notes.panel)}</p>
          </Panel>
        </div>
      </Section>

      {/* ---------- Button ---------- */}
      <Section
        eyebrow="05"
        title={t(I18N_KEYS.styleguide.sections.button)}
        note={t(I18N_KEYS.styleguide.notes.button)}
      >
        <div className={styles.demoRow}>
          <Button variant="primary" leading="+">
            {t(I18N_KEYS.styleguide.samples.primary)}
          </Button>
          <Button variant="secondary" trailing="▾">
            {t(I18N_KEYS.styleguide.samples.secondary)}
          </Button>
          <Button variant="ghost">{t(I18N_KEYS.styleguide.samples.ghost)}</Button>
          <Button variant="danger">{t(I18N_KEYS.styleguide.samples.danger)}</Button>
        </div>
        <div className={styles.demoRow}>
          <Button variant="primary" size="sm">
            {t(I18N_KEYS.styleguide.samples.primary)}
          </Button>
          <Button variant="secondary" size="sm" trailing="▾">
            {t(I18N_KEYS.styleguide.samples.secondary)}
          </Button>
          <Button variant="ghost" size="sm">
            {t(I18N_KEYS.styleguide.samples.ghost)}
          </Button>
          <Button variant="primary" loading>
            {t(I18N_KEYS.styleguide.samples.loading)}
          </Button>
          <Button variant="secondary" disabled>
            {t(I18N_KEYS.styleguide.samples.disabled)}
          </Button>
        </div>
      </Section>

      {/* ---------- IconButton ---------- */}
      <Section
        eyebrow="06"
        title={t(I18N_KEYS.styleguide.sections.iconButton)}
        note={t(I18N_KEYS.styleguide.notes.iconButton)}
      >
        <div className={styles.demoRow}>
          <IconButton aria-label="more">⋯</IconButton>
          <IconButton aria-label="expand" variant="secondary">▾</IconButton>
          <IconButton aria-label="close" size="sm">✕</IconButton>
          <IconButton aria-label="add" variant="secondary">+</IconButton>
        </div>
      </Section>

      {/* ---------- Badge ---------- */}
      <Section
        eyebrow="07"
        title={t(I18N_KEYS.styleguide.sections.badge)}
        note={t(I18N_KEYS.styleguide.notes.badge)}
      >
        <div className={styles.demoRow}>
          <Badge>{t(I18N_KEYS.styleguide.samples.badgeDefault)}</Badge>
          <Badge variant="info" data>{t(I18N_KEYS.styleguide.samples.badgeInfo)}</Badge>
          <Badge variant="success">{t(I18N_KEYS.styleguide.samples.badgeSuccess)}</Badge>
          <Badge variant="warning">{t(I18N_KEYS.styleguide.samples.badgeWarning)}</Badge>
          <Badge variant="danger">{t(I18N_KEYS.styleguide.samples.badgeDanger)}</Badge>
        </div>
        <div className={styles.demoRow}>
          <Badge variant="success" leading={<ProgressDot tone="grove" size={6} />}>
            {t(I18N_KEYS.styleguide.samples.badgeSuccess)}
          </Badge>
          <Badge variant="warning" leading={<ProgressDot tone="flare" size={6} />}>
            {t(I18N_KEYS.styleguide.samples.badgeWarning)}
          </Badge>
          <Badge variant="danger" leading={<ProgressDot tone="breach" size={6} />}>
            {t(I18N_KEYS.styleguide.samples.badgeDanger)}
          </Badge>
        </div>
      </Section>

      {/* ---------- Banner ---------- */}
      <Section
        eyebrow="08"
        title={t(I18N_KEYS.styleguide.sections.banner)}
        note={t(I18N_KEYS.styleguide.notes.banner)}
      >
        <div className={styles.bannerStack}>
          <Banner tone="info" label={t(I18N_KEYS.styleguide.samples.bannerInfo)}>
            {t(I18N_KEYS.states.notInstalled.body, {
              url: "https://mise.jdx.dev/installing.html",
            })}
            <div className={styles.bannerAction}>
              <Button variant="secondary" size="sm">
                {t(I18N_KEYS.common.ok)}
              </Button>
            </div>
          </Banner>
          <Banner tone="warning" label={t(I18N_KEYS.states.tooOld.title)}>
            {t(I18N_KEYS.styleguide.samples.bannerWarning)}
          </Banner>
          <Banner tone="danger" label={t(I18N_KEYS.states.notInstalled.title)}>
            {t(I18N_KEYS.styleguide.samples.bannerDanger)}
          </Banner>
          <Banner tone="success" label={t(I18N_KEYS.states.ready)}>
            {t(I18N_KEYS.styleguide.samples.bannerSuccess)}
          </Banner>
        </div>
      </Section>

      {/* ---------- Table ---------- */}
      <Section
        eyebrow="09"
        title={t(I18N_KEYS.styleguide.sections.table)}
        note={t(I18N_KEYS.styleguide.notes.table)}
      >
        <Table<ToolRow>
          columns={toolColumns}
          rows={TOOL_ROWS}
          rowKey={(r) => r.id}
        />
      </Section>

      {/* ---------- DataRow ---------- */}
      <Section
        eyebrow="10"
        title={t(I18N_KEYS.styleguide.sections.dataRow)}
        note={t(I18N_KEYS.styleguide.notes.dataRow)}
      >
        <Panel>
          <dl className={styles.dataList}>
            <DataRow
              label={t(I18N_KEYS.labels.version)}
              value="22.11.0"
              tone="beam"
            />
            <DataRow
              label={t(I18N_KEYS.labels.binary)}
              value="/usr/local/bin/mise"
            />
            <DataRow
              label={t(I18N_KEYS.labels.minimum)}
              value="2025.1.0"
              tone="muted"
            />
            <DataRow
              label="RAW"
              value={'{ "version": "2025.8.3", "platform": "macos-arm64" }'}
              block
              full
            />
          </dl>
        </Panel>
      </Section>

      {/* ---------- EmptyState ---------- */}
      <Section
        eyebrow="11"
        title={t(I18N_KEYS.styleguide.sections.emptyState)}
        note={t(I18N_KEYS.styleguide.notes.emptyState)}
      >
        <EmptyState
          eyebrow={t(I18N_KEYS.home.eyebrow)}
          title={t(I18N_KEYS.styleguide.samples.emptyTitle)}
          body={t(I18N_KEYS.styleguide.samples.emptyBody)}
          action={
            <Button variant="primary" leading="+">
              {t(I18N_KEYS.styleguide.samples.emptyAction)}
            </Button>
          }
        />
      </Section>

      {/* ---------- ProgressDot ---------- */}
      <Section
        eyebrow="12"
        title={t(I18N_KEYS.styleguide.sections.progressDot)}
        note={t(I18N_KEYS.styleguide.notes.progressDot)}
      >
        <div className={styles.demoRow}>
          <span className={styles.dotRow}>
            <ProgressDot tone="grove" title={t(I18N_KEYS.styleguide.samples.dotReady)} />
            <span className={styles.dotLabel}>
              {t(I18N_KEYS.styleguide.samples.dotReady)}
            </span>
          </span>
          <span className={styles.dotRow}>
            <ProgressDot tone="flare" title={t(I18N_KEYS.styleguide.samples.dotAttention)} />
            <span className={styles.dotLabel}>
              {t(I18N_KEYS.styleguide.samples.dotAttention)}
            </span>
          </span>
          <span className={styles.dotRow}>
            <ProgressDot tone="breach" title={t(I18N_KEYS.styleguide.samples.dotError)} />
            <span className={styles.dotLabel}>
              {t(I18N_KEYS.styleguide.samples.dotError)}
            </span>
          </span>
          <span className={styles.dotRow}>
            <ProgressDot tone="dim" title={t(I18N_KEYS.styleguide.samples.dotIdle)} />
            <span className={styles.dotLabel}>
              {t(I18N_KEYS.styleguide.samples.dotIdle)}
            </span>
          </span>
        </div>
        <div className={styles.demoRow}>
          <span className={styles.dotRow}>
            <ProgressDot tone="beam" size={6} title="6" />
            <ProgressDot tone="beam" size={10} title="10" />
            <ProgressDot tone="beam" size={14} title="14" />
            <ProgressDot tone="beam" size={20} title="20" />
          </span>
        </div>
      </Section>
    </div>
  );
}

interface SectionProps {
  eyebrow: string;
  title: string;
  note: string;
  children: React.ReactNode;
}

function Section({ eyebrow, title, note, children }: SectionProps) {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <span className={styles.sectionEyebrow}>{eyebrow}</span>
        <h2 className={styles.sectionTitle}>{title}</h2>
        <p className={styles.sectionNote}>{note}</p>
      </div>
      <div className={styles.sectionBody}>{children}</div>
    </section>
  );
}
