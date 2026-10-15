import { useCallback, useEffect, useRef, useState } from "react";

/**
 * ERD-WEB-QUALITY H4 (WCAG 3.3.1): tras un envío con errores, mueve el foco al primer campo
 * marcado con aria-invalid. Se ejecuta después del render que pinta los errores.
 */
export function useFocusFirstInvalid<T extends HTMLElement = HTMLFormElement>() {
  const formRef = useRef<T>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (attempt === 0) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [attempt]);
  const flagInvalid = useCallback(() => setAttempt((n) => n + 1), []);
  return { formRef, flagInvalid };
}
