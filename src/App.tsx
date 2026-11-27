import { useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { Body } from './features/Body';
import { Home } from './features/Home';
import { History, WorkoutDetail } from './features/History';
import { ExerciseDetail, Progress } from './features/Progress';
import { RoutineEditor } from './features/RoutineEditor';
import { Settings } from './features/Settings';
import { WorkoutScreen } from './features/WorkoutScreen';
import { useActiveWorkout } from './lib/hooks';
import { restTimer } from './lib/restTimer';
import { useRoute } from './lib/router';
import { DialogHost } from './ui/dialogs';
import { BottomBars } from './ui/layout';

export function App() {
  const [section, id] = useRoute();
  const rest = useSyncExternalStore(restTimer.subscribe, restTimer.get);
  const active = useActiveWorkout();

  let screen: ReactNode;
  let tabs = false;
  if (section === 'workout') screen = <WorkoutScreen />;
  else if (section === 'routine' && id) screen = <RoutineEditor key={id} id={id} />;
  else if (section === 'history' && id) screen = <WorkoutDetail key={id} id={id} />;
  else if (section === 'exercise' && id) screen = <ExerciseDetail key={id} id={id} />;
  else if (section === 'body') screen = <Body />;
  else {
    tabs = true;
    if (section === 'history') screen = <History />;
    else if (section === 'progress') screen = <Progress />;
    else if (section === 'settings') screen = <Settings />;
    else screen = <Home />;
  }

  // Espacio que hay que dejar libre al final de la página para las barras fijas.
  const bars = (rest ? 1 : 0) + (active && section !== 'workout' ? 1 : 0);
  const bottomPad = (tabs ? 58 : 0) + bars * 76 + 24;

  return (
    <div className="app" style={{ '--bottom-pad': `${bottomPad}px` } as CSSProperties}>
      {screen}
      <BottomBars section={tabs ? section : section ?? 'sub'} tabs={tabs} />
      <DialogHost />
    </div>
  );
}
