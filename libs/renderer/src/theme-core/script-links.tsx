import { useAtom } from '@xoid/react';
import { currentScriptLinks$, initialBaseUrl$ } from '@qspider/game-state';
import { useEffect } from 'react';

/**
 * C1 — `<script-link src>` executes.
 *
 * This component used to render `<script src={…} />` and the tag appeared in
 * the DOM with the right `src` while no request was ever made. react-dom
 * deliberately creates a `<script>` element through a detached `innerHTML`
 * parse, which sets its "already started" flag, and an already-started script
 * never fetches or runs however it is inserted. `<css-link>` works because
 * `<link>` gets no such treatment.
 *
 * So the element is created imperatively instead, from an effect. The tag's
 * public shape is unchanged — same attribute, same `qspider:` prefix
 * resolution — so a theme that declares one today is unaffected.
 *
 * The cleanup removes the element, which is all it can do: a script that has
 * run cannot be un-run, so swapping themes at runtime leaves the previous
 * theme's JS loaded. Every other player behaves the same way; a theme that
 * loads JS is expected to guard its own re-entry.
 */
export const QspScriptLinks: React.FC = () => {
  const scriptLinks = useAtom(currentScriptLinks$);
  const baseUrl = useAtom(initialBaseUrl$);
  useEffect(() => {
    const nodes = scriptLinks.map((src) => {
      const el = document.createElement('script');
      el.src = src.startsWith('qspider:') ? src.replace('qspider:', baseUrl) : src;
      el.defer = true;
      document.head.appendChild(el);
      return el;
    });
    return (): void => {
      for (const el of nodes) el.remove();
    };
  }, [scriptLinks, baseUrl]);
  return null;
};
