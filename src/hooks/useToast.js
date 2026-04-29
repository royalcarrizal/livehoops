import { useState, useCallback, useRef } from 'react';

export function useToast() {
  const [toast, setToast]   = useState(null);
  const timerRef             = useRef(null);

  const showToast = useCallback((message) => {
    clearTimeout(timerRef.current);
    setToast(message);
    timerRef.current = setTimeout(() => setToast(null), 2500);
  }, []);

  return { toast, showToast };
}
