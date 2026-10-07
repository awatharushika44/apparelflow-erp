import { AlertIcon } from './Icons';

// Label stays visible on the border. The control sets aria-describedby={`${id}-err`}.
export default function Field({ id, label, error, hint, children }) {
  return (
    <div className="field">
      <div className="field-box">
        <label htmlFor={id}>{label}</label>
        {children}
      </div>
      {hint && !error ? <p className="hint">{hint}</p> : null}
      <p id={`${id}-err`} className="field-error" aria-live="polite">
        {error ? (
          <>
            <AlertIcon />
            <span>{error}</span>
          </>
        ) : null}
      </p>
    </div>
  );
}