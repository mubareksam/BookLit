import { BooklitShell } from '@/components/BooklitShell';
import { ErrorBoundary } from '@/components/ErrorBoundary';

export default function HomePage() {
  return (
    <ErrorBoundary>
      <BooklitShell />
    </ErrorBoundary>
  );
}
