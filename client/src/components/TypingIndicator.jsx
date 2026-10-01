export function describeTyping(names) {
  if (names.length === 0) return '';
  if (names.length === 1) return `${names[0]} is typing…`;
  if (names.length <= 3) {
    return `${names.slice(0, -1).join(', ')} and ${names.at(-1)} are typing…`;
  }
  return 'Several people are typing…';
}

export function TypingIndicator({ typers }) {
  const text = describeTyping(typers.map((u) => u.displayName));
  return (
    <div className="typing" aria-live="polite">
      {text && (
        <>
          <span className="typing__dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          {text}
        </>
      )}
    </div>
  );
}
