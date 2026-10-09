import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <main
      className="flex min-h-dvh items-center justify-center p-6"
      role="status"
      aria-label="Loading page"
    >
      <Card className="w-full max-w-lg" aria-hidden="true">
        <CardHeader className="gap-3">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-8 w-3/4" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="mt-6 h-10 w-32" />
        </CardContent>
      </Card>
    </main>
  );
}
