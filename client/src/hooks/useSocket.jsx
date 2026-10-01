import { createContext, use, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { useLatest } from './useLatest.js';

const SocketContext = createContext(null);

/**
 * Owns the single socket.io connection. Mount it only while logged in: unmounting (logout)
 * disconnects. `reconnects` increments on every successful reconnect so data can be re-synced.
 *
 * The server ends a socket when its session is logged out or expires, and rejects new
 * handshakes without a session. socket.io won't retry either case, so `onAuthLost` is asked
 * whether the session is still valid: false (logged out) leaves the socket closed, true reconnects.
 */
export function SocketProvider({ children, onAuthLost }) {
  const [socket, setSocket] = useState(null);
  const [status, setStatus] = useState('connecting');
  const [reconnects, setReconnects] = useState(0);
  const onAuthLostRef = useLatest(onAuthLost);

  useEffect(() => {
    const instance = io({ withCredentials: true });
    let connectedBefore = false;

    const checkSession = async () => {
      const stillValid = (await onAuthLostRef.current?.()) ?? false;
      if (stillValid && !instance.connected) instance.connect();
    };
    const onConnect = () => {
      setStatus('connected');
      if (connectedBefore) setReconnects((n) => n + 1);
      connectedBefore = true;
    };
    const onDisconnect = (reason) => {
      setStatus('disconnected');
      if (reason === 'io server disconnect') checkSession();
    };
    const onConnectError = (err) => {
      setStatus('disconnected');
      if (err?.message === 'Not authenticated') checkSession();
    };
    const onReconnectAttempt = () => setStatus('connecting');

    instance.on('connect', onConnect);
    instance.on('disconnect', onDisconnect);
    instance.on('connect_error', onConnectError);
    instance.io.on('reconnect_attempt', onReconnectAttempt);
    setSocket(instance);

    return () => {
      instance.off('connect', onConnect);
      instance.off('disconnect', onDisconnect);
      instance.off('connect_error', onConnectError);
      instance.io.off('reconnect_attempt', onReconnectAttempt);
      instance.disconnect();
    };
  }, [onAuthLostRef]);

  const value = useMemo(() => ({ socket, status, reconnects }), [socket, status, reconnects]);
  return <SocketContext value={value}>{children}</SocketContext>;
}

export function useSocket() {
  const context = use(SocketContext);
  if (!context) throw new Error('useSocket must be used inside <SocketProvider>');
  return context;
}

/** Subscribes to a server event; `handler` may change every render without resubscribing. */
export function useSocketEvent(event, handler) {
  const { socket } = useSocket();
  const handlerRef = useLatest(handler);

  useEffect(() => {
    if (!socket) return;
    const listener = (...args) => handlerRef.current(...args);
    socket.on(event, listener);
    return () => socket.off(event, listener);
  }, [socket, event, handlerRef]);
}

/** Runs `handler` after the socket reconnects (not on the first connect). */
export function useOnReconnect(handler) {
  const { reconnects } = useSocket();
  const handlerRef = useLatest(handler);
  const seen = useRef(reconnects);

  useEffect(() => {
    if (reconnects === seen.current) return;
    seen.current = reconnects;
    handlerRef.current();
  }, [reconnects, handlerRef]);
}
