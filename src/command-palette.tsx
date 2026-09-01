import React, { useEffect, useRef, useState } from 'react';
import { matchCommands, matchSkills } from './lib/commands.mjs';

type Command = { id: string; label: string; hint: string; takesArgs: boolean; argHint?: string };
type Skill = { name: string; description?: string; category?: string };

// One flat, navigable list: built-in commands first, then real installed
// skills. Both are keyboard-selectable so ↑↓/Enter never dead-ends between
// the two groups.
type Row =
  | { kind: 'command'; command: Command }
  | { kind: 'skill'; skill: Skill };

export function CommandPalette({
  draft,
  skills,
  onPick,
  onPickSkill,
  onClose,
}: {
  draft: string;
  skills: Skill[];
  onPick: (command: Command) => void;
  onPickSkill: (skill: Skill) => void;
  onClose: () => void;
}) {
  const commandRows: Row[] = (matchCommands(draft) as Command[]).map((command) => ({ kind: 'command', command }));
  const skillRows: Row[] = (matchSkills(draft, skills) as Skill[]).map((skill) => ({ kind: 'skill', skill }));
  const rows: Row[] = [...commandRows, ...skillRows];
  const [cursor, setCursor] = useState(0);
  const listRef = useRef<HTMLUListElement | null>(null);

  useEffect(() => {
    setCursor((current) => (current >= rows.length ? 0 : current));
  }, [rows.length]);

  const choose = (row: Row) => {
    if (row.kind === 'command') onPick(row.command);
    else onPickSkill(row.skill);
  };

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!rows.length) return;
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setCursor((current) => (current + 1) % rows.length);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setCursor((current) => (current - 1 + rows.length) % rows.length);
      } else if (event.key === 'Tab' || event.key === 'Enter') {
        // Enter/Tab commits the highlighted row while the draft is still just a
        // verb/skill token (no argument space yet). stopPropagation keeps the
        // composer's own Enter-to-send handler from firing in the same flow.
        const trimmed = draft.trim();
        if (!trimmed.includes(' ')) {
          event.preventDefault();
          event.stopPropagation();
          choose(rows[cursor]);
        }
      } else if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [rows, cursor, draft, onPick, onPickSkill, onClose]);

  if (!rows.length) return null;

  const firstSkillIndex = commandRows.length;

  return (
    <div className="command-palette" role="listbox" aria-label="Lệnh và kỹ năng">
      <div className="command-palette-head">
        <b>{skillRows.length ? 'Lệnh & kỹ năng' : 'Lệnh nhanh'}</b>
        <small>↑↓ chọn · Enter dùng · Esc đóng</small>
      </div>
      <ul ref={listRef}>
        {rows.map((row, index) => {
          const showSkillHeader = row.kind === 'skill' && index === firstSkillIndex;
          if (row.kind === 'command') {
            const command = row.command;
            return (
              <li key={`c-${command.id}`}>
                <button
                  type="button"
                  role="option"
                  aria-selected={index === cursor}
                  className={index === cursor ? 'active' : ''}
                  onMouseEnter={() => setCursor(index)}
                  onClick={() => onPick(command)}
                >
                  <b>{command.label}</b>
                  <span>{command.hint}</span>
                  {command.takesArgs && command.argHint ? <em>{command.argHint}</em> : null}
                </button>
              </li>
            );
          }
          const skill = row.skill;
          return (
            <React.Fragment key={`s-${skill.name}`}>
              {showSkillHeader ? <li className="palette-group">Kỹ năng trong hệ thống</li> : null}
              <li>
                <button
                  type="button"
                  role="option"
                  aria-selected={index === cursor}
                  className={index === cursor ? 'active skill-row' : 'skill-row'}
                  onMouseEnter={() => setCursor(index)}
                  onClick={() => onPickSkill(skill)}
                >
                  <b>/{skill.name}</b>
                  <span>{skill.description || 'Kỹ năng Hermes'}</span>
                  {skill.category ? <em>{skill.category}</em> : null}
                </button>
              </li>
            </React.Fragment>
          );
        })}
      </ul>
    </div>
  );
}
