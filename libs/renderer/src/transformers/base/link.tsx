import { Attributes, execCode, execSelectedAction, selectAction } from '@qspider/game-state';
import React, { MouseEventHandler, useCallback } from 'react';
import { useAttributes } from '../../content/attributes';

export const Link: React.FC<{
  exec?: string;
  act?: number;
  attrs: Attributes;
  children: React.ReactNode;
}> = ({ exec, act, children, attrs }) => {
  const onClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement, MouseEvent>) => {
      e.preventDefault();
      e.stopPropagation();
      if (exec) {
        execCode(exec);
      } else if (act) {
        selectAction(act - 1);
        execSelectedAction();
      }
    },
    [exec, act],
  );
  const [, style, attributes] = useAttributes(attrs, 'a');
  // `data-gl-exec` carries the `exec:` payload the rendered anchor otherwise
  // drops (href is always `#`), so a theme can read what a link does instead of
  // guessing from its caption. Verbatim, unparsed, and absent on the action
  // form of this component (`act`), where there is no code to carry.
  return (
    // eslint-disable-next-line jsx-a11y/anchor-is-valid
    <a {...attributes} style={style} href="#" data-gl-exec={exec} onClick={onClick}>
      {children}
    </a>
  );
};

export const HtmlLink: React.FC<{
  attrs: Attributes;
  children: React.ReactNode;
}> = ({ children, attrs }) => {
  const [, style, { href, ...attributes }] = useAttributes(attrs, 'a');
  const onClick: MouseEventHandler<HTMLAnchorElement> = (e) => {
    if (attributes['onClick']) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
      return (attributes['onClick'] as unknown as Function)(e);
    }
    if (href.startsWith('#')) {
      e.preventDefault();
      if (href !== '#') {
        window.location.hash = href;
      }
    }
  };
  return (
    <a target="_blank" rel="noreferrer" {...attributes} style={style} href={href} onClick={onClick}>
      {children}
    </a>
  );
};
