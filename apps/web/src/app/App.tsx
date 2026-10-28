import { MapLab } from '../lab/MapLab';
import { Specimen } from '../lab/Specimen';

/** Until the game screens land (phase 2), the map lab is the home page. */
export function App() {
  const path = window.location.pathname.replace(/\/+$/, '');
  if (path === '/lab/specimen') return <Specimen />;
  return <MapLab />;
}
