import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import { importBackup, validateBackup } from '../db/backup';
import { db, setSetting } from '../db/db';
import { clock, fmtDate, relDay } from '../lib/format';
import { useSettings } from '../lib/hooks';
import { restTimer } from '../lib/restTimer';
import { actionSheet, confirmDialog } from '../ui/dialogs';
import { Icon } from '../ui/Icon';
import { Page } from '../ui/layout';
import { exportToFile } from './actions';

declare const __BUILD_DATE__: string;

type Notice = { ok: boolean; text: string };

export function Settings() {
  const settings = useSettings();
  const counts = useLiveQuery(
    async () => ({
      workouts: await db.workouts.where('status').equals('done').count(),
      routines: await db.routines.count(),
      exercises: await db.exercises.count(),
    }),
    [],
  );
  const [notice, setNotice] = useState<Notice | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void navigator.storage?.persisted?.().then(setPersisted);
  }, []);

  const doExport = async () => {
    try {
      if (await exportToFile()) setNotice({ ok: true, text: 'Copia exportada. Guárdala fuera del móvil (iCloud, correo…).' });
    } catch (e) {
      setNotice({ ok: false, text: `No se pudo exportar: ${e instanceof Error ? e.message : String(e)}` });
    }
  };

  const doImport = async (file: File) => {
    setNotice(null);
    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(await file.text());
      } catch {
        throw new Error('El archivo no es un JSON válido.');
      }
      const backup = validateBackup(parsed);
      const summary = `${backup.workouts.length} entrenos, ${backup.routines.length} rutinas y ${backup.exercises.length} ejercicios`;
      const hasData = (counts?.workouts ?? 0) + (counts?.routines ?? 0) > 0;
      let mode: 'merge' | 'replace' = 'merge';
      if (hasData) {
        const choice = await actionSheet({
          title: `El archivo tiene ${summary}`,
          actions: [
            { id: 'merge', label: 'Combinar con lo que ya hay' },
            { id: 'replace', label: 'Borrar lo que hay y dejar solo la copia', danger: true },
          ],
        });
        if (!choice) return;
        mode = choice;
        if (
          mode === 'replace' &&
          !(await confirmDialog({
            title: '¿Reemplazar todos los datos?',
            message: 'Se borrará todo lo que hay ahora en la app. No se puede deshacer.',
            confirmLabel: 'Reemplazar',
            danger: true,
          }))
        ) {
          return;
        }
      }
      await importBackup(db, backup, mode);
      if (mode === 'replace') restTimer.stop();
      // Lo importado ya existe en un archivo: cuenta como copia reciente.
      await setSetting('lastBackupAt', new Date().toISOString());
      setNotice({ ok: true, text: `Importado: ${summary}.` });
    } catch (e) {
      setNotice({ ok: false, text: e instanceof Error ? e.message : String(e) });
    }
  };

  const restMenu = async () => {
    const choice = await actionSheet({
      title: 'Descanso por defecto al añadir un ejercicio',
      grid: true,
      actions: [0, 30, 45, 60, 90, 120, 150, 180].map((s) => ({
        id: String(s),
        label: s === 0 ? 'No' : clock(s),
        selected: settings.defaultRest === s,
      })),
    });
    if (choice !== undefined) await setSetting('defaultRest', Number(choice));
  };

  const wipe = async () => {
    const first = await confirmDialog({
      title: '¿Borrar todos los datos?',
      message: 'Se eliminarán entrenos, rutinas y ejercicios de este dispositivo. Exporta una copia antes si quieres conservarlos.',
      confirmLabel: 'Borrar todo',
      danger: true,
    });
    if (!first) return;
    const second = await confirmDialog({ title: 'Última confirmación', message: 'No se puede deshacer.', confirmLabel: 'Sí, borrar todo', danger: true });
    if (!second) return;
    await db.transaction('rw', [db.exercises, db.routines, db.workouts, db.settings, db.measurements], () =>
      Promise.all([
        db.exercises.clear(),
        db.routines.clear(),
        db.workouts.clear(),
        db.settings.clear(),
        db.measurements.clear(),
      ]),
    );
    restTimer.stop();
    setNotice({ ok: true, text: 'Datos borrados.' });
  };

  return (
    <Page title="Ajustes">
      {notice && (
        <div className={`card ${notice.ok ? 'card-accent' : 'card-warn'}`} role="status">
          {notice.text}
        </div>
      )}

      <h2 className="section-title">Copia de seguridad</h2>
      <div className="card stack">
        <p className="small muted">
          Tus datos solo están en este dispositivo. Si borras la app de la pantalla de inicio o pierdes el móvil, se pierden.
          Exporta una copia de vez en cuando.
        </p>
        <p className="small">
          Última copia:{' '}
          <b>{settings.lastBackupAt ? `${fmtDate(settings.lastBackupAt)} (${relDay(settings.lastBackupAt)})` : 'nunca'}</b>
        </p>
        <button className="btn primary block" onClick={doExport}>
          <Icon name="download" size={18} /> Exportar copia
        </button>
        <button className="btn block" onClick={() => fileInput.current?.click()}>
          <Icon name="upload" size={18} /> Importar copia
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          aria-label="Archivo de copia"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void doImport(file);
          }}
        />
      </div>

      <h2 className="section-title">Entreno</h2>
      <div className="card stack">
        <label className="switch-row">
          <span className="grow">
            Mantener la pantalla encendida
            <span className="small muted" style={{ display: 'block' }}>
              Durante el entreno, para que el descanso siga a la vista.
            </span>
          </span>
          <input
            className="switch"
            type="checkbox"
            checked={settings.keepAwake}
            onChange={(e) => setSetting('keepAwake', e.target.checked)}
          />
        </label>
        <label className="switch-row">
          <span className="grow">
            Progresión automática
            <span className="small muted" style={{ display: 'block' }}>
              Sugiere el objetivo de cada serie: una repetición más o más peso al llegar al tope del rango.
            </span>
          </span>
          <input
            className="switch"
            type="checkbox"
            checked={settings.autoProgression}
            onChange={(e) => setSetting('autoProgression', e.target.checked)}
          />
        </label>
        <label className="switch-row">
          <span className="grow">
            Sonido al terminar el descanso
            <span className="small muted" style={{ display: 'block' }}>
              Solo suena con la app abierta y en pantalla.
            </span>
          </span>
          <input className="switch" type="checkbox" checked={settings.sound} onChange={(e) => setSetting('sound', e.target.checked)} />
        </label>
        <div className="switch-row">
          <span className="grow">Descanso por defecto</span>
          <button className="chip" onClick={restMenu}>
            <Icon name="timer" size={16} />
            {settings.defaultRest > 0 ? clock(settings.defaultRest) : 'Sin descanso'}
          </button>
        </div>
      </div>

      <h2 className="section-title">Datos en este dispositivo</h2>
      <div className="card stack">
        <p>
          {counts ? `${counts.workouts} entrenos · ${counts.routines} rutinas · ${counts.exercises} ejercicios` : '…'}
        </p>
        {persisted !== null && (
          <p className="small muted">
            {persisted
              ? 'El navegador ha marcado estos datos como persistentes: no los borrará por falta de espacio.'
              : 'El navegador no garantiza conservar estos datos si falta espacio. Instalar la app en la pantalla de inicio y exportar copias reduce el riesgo.'}
          </p>
        )}
        <button className="btn danger block" onClick={wipe}>
          <Icon name="trash" size={18} /> Borrar todos los datos
        </button>
      </div>

      <p className="small muted" style={{ textAlign: 'center' }}>
        Fitness · compilada el {__BUILD_DATE__}
      </p>
    </Page>
  );
}
