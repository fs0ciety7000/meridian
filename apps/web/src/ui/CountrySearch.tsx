import { useId, useMemo, useState, type KeyboardEvent } from 'react';
import { searchCountries, type CountryName } from './countryNames';
import styles from './CountrySearch.module.css';

interface Props {
  names: CountryName[];
  onSelect: (iso3: string) => void;
}

/**
 * Country search as an ARIA combobox, styled like an atlas register (design-system §6.12).
 * A complete alternative to pointing at the map (accessibility, architecture §4.4).
 */
export function CountrySearch({ names, onSelect }: Props) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listId = useId();
  const results = useMemo(() => searchCountries(names, query), [names, query]);
  const open = results.length > 0;

  const choose = (n: CountryName | undefined) => {
    if (!n) return;
    onSelect(n.iso3);
    setQuery('');
    setActive(0);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(results[active]);
    } else if (e.key === 'Escape') {
      setQuery('');
    }
  };

  return (
    <div className={styles.search}>
      <label className="visually-hidden" htmlFor={`${listId}-input`}>
        Chercher un pays
      </label>
      <input
        id={`${listId}-input`}
        className={styles.input}
        type="search"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        placeholder="Chercher un pays…"
        autoComplete="off"
        spellCheck={false}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
      />
      {open && (
        <ul id={listId} role="listbox" className={styles.list} aria-label="Pays">
          {results.map((n, i) => (
            <li
              key={n.iso3}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={styles.option}
              onPointerDown={(e) => {
                e.preventDefault();
                choose(n);
              }}
            >
              <span className={styles.name}>{n.name}</span>
              <span className={styles.code}>{n.iso3}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
