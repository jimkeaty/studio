'use client'; // Error components must be Client Components

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error(error);
  }, [error]);

  return (
    <div className="flex items-center justify-center p-4">
        <Card className="w-full max-w-lg text-center">
            <CardHeader>
                <div className="mx-auto bg-destructive/10 p-3 rounded-full w-fit">
                    <AlertTriangle className="h-8 w-8 text-destructive" />
                </div>
                <CardTitle className="mt-4">Something Went Wrong</CardTitle>
                <CardDescription>
                    An unexpected error occurred while trying to load the dashboard.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                    You can try to reload the page or contact support if the problem persists.
                </p>
                <details className="text-xs text-left bg-muted p-2 rounded-md">
                    <summary className="cursor-pointer text-muted-foreground">Error Details</summary>
                    <pre className="mt-2 whitespace-pre-wrap font-mono text-destructive-foreground">
                        {error.message}
                    </pre>
                </details>
                <Button
                    onClick={
                    // Attempt to recover by trying to re-render the segment
                    () => reset()
                    }
                    className="mt-6"
                >
                    Try Again
                </Button>
            </CardContent>
        </Card>
    </div>
  );
}
