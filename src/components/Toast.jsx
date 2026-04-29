export default function Toast({ message }) {
  if (!message) return null;
  return (
    <div className="toast-pill">
      {message}
    </div>
  );
}
