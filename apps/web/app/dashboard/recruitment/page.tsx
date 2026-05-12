 'use client';

import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api';
import { Users, Briefcase, AlertCircle } from 'lucide-react';

interface CurrentUser {
  id: string;
  org_id?: string | null;
}

interface PositionItem {
  id: string;
  title: string;
  level: number;
  confirmed?: boolean;
  filled?: boolean;
}

export default function RecruitmentPage() {
  const meQuery = useQuery({
    queryKey: ['me'],
    queryFn: () => apiFetch<CurrentUser>('/api/me')
  });

  const positionsQuery = useQuery({
    queryKey: ['org-positions', meQuery.data?.org_id],
    queryFn: () => apiFetch<{ items: PositionItem[] }>(`/api/orgs/${meQuery.data?.org_id}/positions`),
    select: (data) => data.items ?? [],
    enabled: Boolean(meQuery.data?.org_id)
  });

  const queryClient = useQueryClient();

  const createJobMutation = useMutation({
    mutationFn: (payload: { title: string; department: string; description: string }) =>
      apiFetch('/api/recruitment/jobs', {
        method: 'POST',
        body: JSON.stringify(payload)
      }),
    onSuccess: () => {
      toast.success('Job created');
      void queryClient.invalidateQueries({ queryKey: ['org-positions', meQuery.data?.org_id] });
      void queryClient.invalidateQueries({ queryKey: ['recruitment-jobs'] });
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : 'Failed to create job';
      toast.error(message);
    }
  });

  const openPositions = useMemo(
    () => (positionsQuery.data ?? []).filter((position) => !position.filled),
    [positionsQuery.data]
  );

  const filledCount = (positionsQuery.data ?? []).length - openPositions.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-text-primary">Recruitment</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Open positions are highlighted here and marked red in the org tree.
          </p>
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <Card className="border-border bg-bg-surface p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-text-secondary">Open Positions</p>
              <p className="mt-2 text-3xl font-bold text-text-primary">{openPositions.length}</p>
            </div>
            <AlertCircle className="h-8 w-8 text-red-500" />
          </div>
        </Card>

        <Card className="border-border bg-bg-surface p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-text-secondary">Filled Positions</p>
              <p className="mt-2 text-3xl font-bold text-text-primary">{filledCount}</p>
            </div>
            <Briefcase className="h-8 w-8 text-accent" />
          </div>
        </Card>

        <Card className="border-border bg-bg-surface p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-text-secondary">Total Positions</p>
              <p className="mt-2 text-3xl font-bold text-text-primary">{(positionsQuery.data ?? []).length}</p>
            </div>
            <Users className="h-8 w-8 text-accent" />
          </div>
        </Card>
      </section>

      <div>
        <h2 className="mb-4 text-lg font-semibold text-text-primary">Unfilled Positions</h2>

        {positionsQuery.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : openPositions.length > 0 ? (
          <div className="space-y-3">
            {openPositions.map((position) => (
              <Card key={position.id} className="border border-red-300 bg-red-50 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-red-900">{position.title}</p>
                      <Badge className="bg-red-100 text-red-800">Unfilled</Badge>
                    </div>
                    <p className="mt-1 text-xs text-red-700">Position level {position.level}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-red-700">Needs hiring</p>
                    <Button
                      size="sm"
                      onClick={() =>
                        createJobMutation.mutate({
                          title: position.title,
                          department: 'General',
                          description: `Hiring for ${position.title} (level ${position.level})`
                        })
                      }
                      disabled={createJobMutation.isPending}
                    >
                      {createJobMutation.isPending ? 'Creating...' : 'Create job'}
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="border-border bg-bg-surface p-10 text-center">
            <Users className="mx-auto mb-3 h-8 w-8 text-text-secondary" />
            <p className="text-text-secondary">All positions are filled.</p>
          </Card>
        )}
      </div>
    </div>
  );
}
