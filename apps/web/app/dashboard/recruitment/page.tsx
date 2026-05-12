 'use client';

import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { DashboardPageFrame } from '@/components/dashboard/dashboard-surface';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api';
import { canAccessSection, canManageRecruitment } from '@/lib/access';
import { Users, Briefcase, AlertCircle } from 'lucide-react';

interface CurrentUser {
  id: string;
  org_id?: string | null;
  role?: 'ceo' | 'cfo' | 'manager' | 'worker';
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
  const canViewRecruitment = canAccessSection(meQuery.data?.role, 'recruitment');
  const canCreateJobs = canManageRecruitment(meQuery.data?.role);

  const positionsQuery = useQuery({
    queryKey: ['org-positions', meQuery.data?.org_id],
    queryFn: () => apiFetch<{ items: PositionItem[] }>(`/api/orgs/${meQuery.data?.org_id}/positions`),
    select: (data) => data.items ?? [],
    enabled: Boolean(meQuery.data?.org_id) && canViewRecruitment
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
    <DashboardPageFrame
      eyebrow="Recruitment"
      title="Open positions"
      description="Review unfilled seats, see hiring pressure, and create roles directly from the staffing map."
    >
      <div className="space-y-6">

      {!canViewRecruitment ? (
        <Card className="p-4 text-sm text-text-secondary">
          Recruitment workflows are available to CEO, CFO, and manager roles.
        </Card>
      ) : null}

      <section className="grid gap-4 md:grid-cols-3">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-text-secondary">Open Positions</p>
              <p className="mt-2 text-3xl font-bold text-text-primary">{openPositions.length}</p>
            </div>
            <AlertCircle className="h-8 w-8 text-danger" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-text-secondary">Filled Positions</p>
              <p className="mt-2 text-3xl font-bold text-text-primary">{filledCount}</p>
            </div>
            <Briefcase className="h-8 w-8 text-accent" />
          </div>
        </Card>

        <Card className="p-6">
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
              <Card key={position.id} className="border-danger/20 bg-danger-subtle p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-text-primary">{position.title}</p>
                      <Badge className="bg-danger text-white">Unfilled</Badge>
                    </div>
                    <p className="mt-1 text-xs text-danger">Position level {position.level}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-danger">Needs hiring</p>
                    <Button
                      size="sm"
                      onClick={() =>
                        createJobMutation.mutate({
                          title: position.title,
                          department: 'General',
                          description: `Hiring for ${position.title} (level ${position.level})`
                        })
                      }
                      disabled={!canCreateJobs || createJobMutation.isPending}
                    >
                      {createJobMutation.isPending ? 'Creating...' : 'Create job'}
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="p-10 text-center">
            <Users className="mx-auto mb-3 h-8 w-8 text-text-secondary" />
            <p className="text-text-secondary">All positions are filled.</p>
          </Card>
        )}
      </div>
      </div>
    </DashboardPageFrame>
  );
}
