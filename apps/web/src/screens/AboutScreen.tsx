import { useState } from 'react';
import { useLocale, useT } from '../game/i18n';
import { navigate } from '../game/router';
import { isTelemetryEnabled, setTelemetryEnabled } from '../game/telemetry';
import styles from './screens.module.css';

/**
 * About, privacy, sources and the public geography policy (development-plan 3.8). Plain,
 * readable pages: the same paper as the passport, no map.
 */
export function AboutScreen() {
  const t = useT();
  const locale = useLocale((s) => s.locale);
  const fr = locale === 'fr';
  const [telemetry, setTelemetry] = useState(isTelemetryEnabled);
  const toggle = () => {
    setTelemetryEnabled(!telemetry);
    setTelemetry(isTelemetryEnabled());
  };

  return (
    <main className={`${styles.passport} paper`}>
      <article className={styles.about}>
        <button type="button" className={styles.link} onClick={() => navigate('/')}>
          ← {t('atlas')}
        </button>
        <h1 className={styles.launcherTitle}>{fr ? 'À propos de Meridian' : 'About Meridian'}</h1>
        <p>
          {fr
            ? 'Meridian est un jeu de géographie gratuit, sans compte ni publicité : on plante des camps sur un atlas d’expédition et l’on trace sa route autour du monde.'
            : 'Meridian is a free geography game, with no account and no ads: you pitch camps on an expedition atlas and trace your route around the world.'}
        </p>

        <h2>{fr ? 'Données personnelles' : 'Personal data'}</h2>
        <p>
          {fr
            ? 'Vos parties, votre passeport et votre atlas restent dans votre navigateur (IndexedDB). Aucun compte, aucun cookie de suivi, aucune donnée transmise à des tiers.'
            : 'Your runs, passport and atlas stay in your browser (IndexedDB). No account, no tracking cookie, no data sent to third parties.'}
        </p>
        <p>
          {fr
            ? 'Pour équilibrer le jeu, l’application peut envoyer des statistiques anonymes et agrégées : consigne, réponse valide ou non, durée d’une étape, distance d’une expédition. Pas d’adresse IP conservée, pas d’identifiant durable. Le réglage « Do Not Track » de votre navigateur est respecté.'
            : 'To balance the game, the app may send anonymous, aggregated statistics: prompt, valid answer or not, time per leg, distance of an expedition. No IP address kept, no lasting identifier. Your browser’s “Do Not Track” setting is honoured.'}
        </p>
        <p>
          <button
            type="button"
            className={styles.ghostButton}
            onClick={toggle}
            aria-pressed={telemetry}
          >
            {telemetry
              ? fr
                ? 'Statistiques anonymes : activées — désactiver'
                : 'Anonymous statistics: on — turn off'
              : fr
                ? 'Statistiques anonymes : désactivées — activer'
                : 'Anonymous statistics: off — turn on'}
          </button>
        </p>
        <p>
          {fr
            ? 'Hébergement : serveur auto-hébergé (Coolify), derrière Cloudflare, qui voit les requêtes réseau comme tout intermédiaire technique.'
            : 'Hosting: self-hosted server (Coolify), behind Cloudflare, which sees network requests like any technical intermediary.'}
        </p>

        <h2>{fr ? 'Sources et licences' : 'Sources and licences'}</h2>
        <ul>
          <li>
            {fr ? 'Carte' : 'Map'} : Natural Earth 5.1.2 ({fr ? 'domaine public' : 'public domain'})
          </li>
          <li>
            {fr ? 'Faits pays' : 'Country facts'} : Wikidata (CC0),{' '}
            {fr ? 'Banque mondiale' : 'World Bank'} WDI 2024 (CC BY 4.0),{' '}
            {fr ? 'listes de Wikipédia citées une à une' : 'Wikipedia lists cited one by one'}
          </li>
          <li>
            {fr ? 'Polices' : 'Fonts'} : Fraunces, EB Garamond, Instrument Sans, IBM Plex Mono (SIL
            OFL 1.1)
          </li>
          <li>
            {fr ? 'Logiciels' : 'Software'} : React, d3, topojson, Zustand (MIT/ISC), Dexie
            (Apache-2.0), Hono, Zod (MIT)
          </li>
        </ul>

        <h2>{fr ? 'Politique géographique' : 'Geography policy'}</h2>
        <p>
          {fr
            ? 'Les réponses possibles sont les 193 États membres de l’ONU et les 2 États observateurs (Saint-Siège, Palestine) : la liste de l’ONU elle-même, critère externe et neutre. Les territoires rattachés comptent pour leur État (Groenland → Danemark, Guyane → France).'
            : 'Possible answers are the 193 UN member states and the 2 observer states (Holy See, Palestine): the UN’s own list, an external and neutral criterion. Dependent territories count for their state (Greenland → Denmark, French Guiana → France).'}
        </p>
        <p>
          {fr
            ? 'Les zones au statut contesté sont dessinées, avec des frontières en pointillé, mais on ne peut pas y planter de camp : Sahara occidental, Crimée, plateau du Golan, Kosovo, Taïwan, Malouines, Gibraltar, Chypre du Nord, Somaliland… Cette règle uniforme évite d’arbitrer cas par cas ; elle ne prend parti pour aucune revendication. Frontières : Natural Earth, « de facto ».'
            : 'Areas with a disputed status are drawn, with dotted borders, but no camp can be pitched there: Western Sahara, Crimea, the Golan Heights, Kosovo, Taiwan, the Falklands, Gibraltar, Northern Cyprus, Somaliland… This uniform rule avoids case-by-case arbitration; it takes no side in any claim. Borders: Natural Earth, “de facto”.'}
        </p>
        <p className={styles.small}>
          {fr
            ? 'Une erreur, un fait contesté ? Chaque correction est publiée dans le journal de la politique géographique du projet.'
            : 'A mistake, a disputed fact? Every correction is published in the project’s geography policy log.'}
        </p>
      </article>
    </main>
  );
}
