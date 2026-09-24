import { statsContent$ } from '@qspider/game-state';
import { HtmlParser, Markup, RenderNode } from '@qspider/html-renderer';
import { useAtom } from '@xoid/react';
import React, { cloneElement, Fragment, isValidElement, ReactNode, ReactPortal } from 'react';
import { createPortal } from 'react-dom';
import { atom } from 'xoid';
import { GlNodeInfo, GlPortals, GlPortalSpec, GlStatsPortals } from './types';

/**
 * C15 — per-section portals.
 *
 * The stats pane is one string the game writes and the player renders as one
 * run of nodes, so a theme that wants the game's sections in different places
 * could only move the player's own nodes after React placed them — and React
 * owns that subtree. Here the player itself renders each section into an
 * element the theme names, through `ReactDOM.createPortal`: the visible nodes
 * are still the game's own, React still reconciles them, and the containers
 * belong to the theme, which may move, size or hide them freely.
 *
 * A section is a RUN: a node the theme's `header` recognises starts one, and
 * every following top-level node belongs to it until the next header. The run
 * before the first header is the section `''`. Nothing here knows what a
 * header looks like; that decision is the theme's.
 *
 * Fallback, always: a section whose container is not in the document at render
 * time — or that is not mapped and there is no `rest` — renders in place, in
 * order. With no spec set, the pane renders exactly as upstream renders it.
 */

export const portalSpec$ = atom<GlPortalSpec | null>(null);

function isIdOrUndefined(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

function cleanStats(stats: unknown): GlStatsPortals | undefined {
  if (!stats || typeof stats !== 'object') return undefined;
  const { header, targets, rest } = stats as Partial<GlStatsPortals>;
  if (typeof header !== 'function') return undefined;
  const cleanTargets: Record<string, string> = {};
  if (targets && typeof targets === 'object') {
    for (const [key, id] of Object.entries(targets)) {
      if (typeof id === 'string') cleanTargets[key] = id;
    }
  }
  return { header, targets: cleanTargets, rest: typeof rest === 'string' ? rest : undefined };
}

function setPortals(spec: GlPortalSpec): void {
  if (!spec || typeof spec !== 'object') {
    console.warn('qspiderGl.portals.set: the spec must be an object; portals cleared');
    portalSpec$.set(null);
    return;
  }
  // A fresh object every time, so a repeated `set()` re-renders and re-reads
  // the containers — the theme's way to say "the element exists now".
  portalSpec$.set({
    stats: cleanStats(spec.stats),
    actions: isIdOrUndefined(spec.actions) ? spec.actions : undefined,
    objects: isIdOrUndefined(spec.objects) ? spec.objects : undefined,
  });
}

function clearPortals(): void {
  portalSpec$.set(null);
}

export const portals: GlPortals = { set: setPortals, clear: clearPortals };

function containerById(id: string | undefined): Element | null {
  return id ? document.getElementById(id) : null;
}

function flatText(node: ReactNode): string {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(flatText).join('');
  if (isValidElement(node)) return flatText((node.props as { children?: ReactNode }).children);
  return '';
}

type NodeShape = Pick<GlNodeInfo, 'tag' | 'attrs'>;

/** Guessed from the React element — used only when the markup walk below does not line up. */
function shapeOf(node: RenderNode): NodeShape {
  if (typeof node === 'string') return { tag: '#text', attrs: {} };
  if (!node) return { tag: '', attrs: {} };
  const props = node.props as Record<string, unknown>;
  const attrs = { ...((props['attributes'] ?? props['attrs'] ?? {}) as Record<string, unknown>) };
  let tag = '';
  if (typeof node.type === 'string') tag = node.type;
  else if (typeof props['tagName'] === 'string') tag = props['tagName'];
  else if ('exec' in props || 'act' in props || 'href' in attrs) tag = 'a';
  else if ('src' in props) tag = 'img';
  return { tag, attrs };
}

const lineBreaks = new HtmlParser();
const domParser = new DOMParser();

/**
 * The tag and attributes of each top-level node, read from the markup itself,
 * because the player turns many tags (`table`, `font`, links, images…) into
 * components whose React element no longer says what they were. The walk
 * mirrors the parser's top level: the same line-break conversion, one entry
 * per element, one per run of text.
 */
function markupShapes(markup: string): NodeShape[] {
  const doc = domParser.parseFromString(lineBreaks.convertLineBreaks(markup), 'text/html');
  const shapes: NodeShape[] = [];
  let inText = false;
  for (const node of Array.from(doc.body?.childNodes ?? [])) {
    if (node instanceof Element) {
      const attrs: Record<string, unknown> = {};
      for (const attr of Array.from(node.attributes)) attrs[attr.name] = attr.value;
      shapes.push({ tag: node.nodeName.toLowerCase(), attrs });
      inText = false;
    } else if (node.nodeType === Node.TEXT_NODE && node.textContent) {
      if (!inText) shapes.push({ tag: '#text', attrs: {} });
      inText = true;
    }
  }
  return shapes;
}

/**
 * One info per top-level node. The markup's shapes are used when they line up
 * with the parsed nodes one to one (same count, text where text is); a player
 * that dropped or unwrapped a top-level node breaks that, and then every node
 * falls back to what its React element shows.
 */
function nodeInfos(content: RenderNode[], markup: string): GlNodeInfo[] {
  const shapes = markupShapes(markup);
  const aligned =
    shapes.length === content.length &&
    shapes.every((shape, i) => (shape.tag === '#text') === (typeof content[i] === 'string'));
  return content.map((node, i) => ({ ...(aligned ? shapes[i] : shapeOf(node)), text: flatText(node) }));
}

interface Section {
  key: string;
  nodes: RenderNode[];
}

let warnedHeader = false;

function headerKey(header: GlStatsPortals['header'], info: GlNodeInfo): string | null {
  try {
    const key = header(info);
    return typeof key === 'string' && key !== '' ? key : null;
  } catch (e) {
    if (!warnedHeader) {
      warnedHeader = true;
      console.warn('qspiderGl.portals: the stats header function threw; the node is treated as a non-header', e);
    }
    return null;
  }
}

/** Split the pane's top-level nodes into runs; a repeated key becomes `key#2`, `key#3`… */
function splitSections(content: RenderNode[], markup: string, header: GlStatsPortals['header']): Section[] {
  const infos = nodeInfos(content, markup);
  const sections: Section[] = [];
  const seen = new Map<string, number>();
  let current: Section = { key: '', nodes: [] };
  for (const [i, node] of content.entries()) {
    const key = headerKey(header, infos[i]);
    if (key !== null) {
      if (current.key !== '' || current.nodes.length > 0) sections.push(current);
      const count = (seen.get(key) ?? 0) + 1;
      seen.set(key, count);
      current = { key: count === 1 ? key : `${key}#${count}`, nodes: [] };
    }
    current.nodes.push(node);
  }
  if (current.key !== '' || current.nodes.length > 0) sections.push(current);
  return sections;
}

/**
 * Replaces `<Markup content={content} />` inside `<qsp-stats-content>`. It is
 * rendered inside that element, so the pane's `hasBrowserTranslation$` re-key
 * and `isStatsVisible$` unmount reach every portal too.
 */
export const GlStatsSections: React.FC<{ content: RenderNode[] }> = ({ content }) => {
  const spec = useAtom(portalSpec$);
  // The string `content` was parsed from; read here only for tag names.
  const markup = useAtom(statsContent$);
  const stats = spec?.stats;
  if (!stats) return <Markup content={content} />;

  const inPlace: ReactNode[] = [];
  const byContainer = new Map<Element, { id: string; sections: ReactNode[] }>();
  for (const section of splitSections(content, markup, stats.header)) {
    // Keys inside a section count from 0, so a section appearing or vanishing
    // above it re-keys nothing here.
    const nodes = section.nodes.map((node, i) => (isValidElement(node) ? cloneElement(node, { key: i }) : node));
    const body = <Fragment key={`s:${section.key}`}>{nodes}</Fragment>;
    const targets = stats.targets ?? {};
    const id = Object.prototype.hasOwnProperty.call(targets, section.key) ? targets[section.key] : stats.rest;
    const container = containerById(id);
    if (!container || !id) {
      inPlace.push(body);
      continue;
    }
    // One portal per container, so sections sharing one (`rest`) keep the
    // game's order even when one of them appears later.
    const group = byContainer.get(container) ?? { id, sections: [] };
    group.sections.push(body);
    byContainer.set(container, group);
  }
  const portaled: ReactPortal[] = [];
  byContainer.forEach(({ id, sections }, container) => {
    portaled.push(createPortal(sections, container, `p:${id}`));
  });
  return (
    <>
      {inPlace}
      {portaled}
    </>
  );
};

/** Wraps `<qsp-actions-list>` / `<qsp-objects-list>`: the list renders into the named element when it exists. */
export const GlListPortal: React.FC<{ slot: 'actions' | 'objects'; children: ReactNode }> = ({ slot, children }) => {
  const spec = useAtom(portalSpec$);
  const container = containerById(spec?.[slot]);
  // The fragment is the in-place render: the same children, no wrapper element.
  // eslint-disable-next-line react/jsx-no-useless-fragment
  if (!container) return <>{children}</>;
  return createPortal(children, container);
};
