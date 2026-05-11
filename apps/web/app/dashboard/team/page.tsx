'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { apiFetch } from '@/lib/api';
import { Users, Mail, TrendingUp, MoreVertical, Lock, Download, RefreshCw, Eye, EyeOff } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { getRoleFromBrowser } from '@/lib/auth';

interface TeamMember {
  id: string;
  full_name: string;
  email?: string;
  phone?: string;
  role: string;
  department?: string;
  status?: string;
  avatar_url?: string;
  current_load?: number;
}

interface PositionCredential {
  position_id: string;
  position_title: string;
  email: string;
  plaintext_password: string;
  level: number;
}

export default function TeamPage() {
  const browserRole = typeof window !== "undefined" ? getRoleFromBrowser() : null;
  const isCEO = browserRole?.toLowerCase() === "ceo";
  const isManager = browserRole?.toLowerCase() === "manager";

  // Get user info to fetch org_id
  const meQuery = useQuery({
    queryKey: ['team-me'],
    queryFn: () => apiFetch<{ org_id: string }>('/api/me'),
  });

  // CEO: Fetch positions with credentials
  const credentialsQuery = useQuery({
    queryKey: ['positions-credentials', meQuery.data?.org_id],
    queryFn: () => apiFetch<{ positions: PositionCredential[] }>(`/api/onboarding/org/${meQuery.data?.org_id}/positions-with-credentials`),
    select: (data) => data.positions ?? [],
    enabled: !!meQuery.data?.org_id && isCEO
  });

  // Manager/Worker: Fetch team members
  const teamQuery = useQuery({
    queryKey: ['team-members', meQuery.data?.org_id],
    queryFn: () => apiFetch<{ items: TeamMember[] }>(`/api/orgs/${meQuery.data?.org_id}/accounts?limit=100`),
    select: (data) => data,
    enabled: !!meQuery.data?.org_id && !isCEO
  });

  const [showPassword, setShowPassword] = useState<Record<string, boolean>>({});
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetPositionId, setResetPositionId] = useState<string | null>(null);
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);

  const queryClient = useQueryClient();

  // Reset password mutation
  const resetPasswordMutation = useMutation({
    mutationFn: (positionId: string) =>
      apiFetch<{ plaintext_password: string; email: string }>(`/api/onboarding/org/${meQuery.data?.org_id}/positions/${positionId}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({})
      }),
    onSuccess: () => {
      toast.success('Password reset. New password is displayed below.');
      void queryClient.invalidateQueries({ queryKey: ['positions-credentials'] });
      setResetDialogOpen(false);
      setResetPositionId(null);
    },
    onError: (err) => {
      const msg = (err as any)?.message || 'Failed to reset password';
      toast.error(msg);
    }
  });

  const getInitials = (name: string) =>
    name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase();

  const copyToClipboard = (text: string, email: string) => {
    navigator.clipboard.writeText(text);
    setCopiedEmail(email);
    setTimeout(() => setCopiedEmail(null), 2000);
  };

  // ============================================================
  // CEO VIEW: Credentials Management
  // ============================================================
  if (isCEO) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-text-primary">Organization Credentials</h1>
            <p className="mt-1 text-sm text-text-secondary">Manage position login credentials</p>
          </div>
          <Button 
            className="bg-accent hover:bg-accent-hover"
            onClick={() => {
              const orgId = meQuery.data?.org_id;
              if (orgId) {
                window.location.href = `/api/onboarding/org/${orgId}/export-credentials`;
              }
            }}
          >
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        </div>

        {credentialsQuery.isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="border border-border bg-bg-surface p-4">
                <Skeleton className="h-20 w-full" />
              </Card>
            ))}
          </div>
        ) : credentialsQuery.data && credentialsQuery.data.length > 0 ? (
          <div className="space-y-3">
            {credentialsQuery.data.map((cred) => (
              <Card key={cred.position_id} className="border border-border bg-bg-surface p-4 hover:bg-bg-elevated transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-semibold text-text-primary">{cred.position_title}</h3>
                      <Badge className="bg-blue-50 text-blue-700 border border-blue-200">
                        Level {cred.level}
                      </Badge>
                    </div>
                    
                    <div className="space-y-2 mt-3">
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-text-secondary" />
                        <code className="text-sm bg-bg-subtle px-2 py-1 rounded font-mono text-text-primary">
                          {cred.email}
                        </code>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => copyToClipboard(cred.email, cred.email)}
                          className="h-6 w-6 p-0"
                        >
                          {copiedEmail === cred.email ? '✓' : '📋'}
                        </Button>
                      </div>

                      {cred.plaintext_password && cred.plaintext_password !== "(Already viewed - password expired)" ? (
                        <div className="flex items-center gap-2">
                          <Lock className="h-4 w-4 text-warning" />
                          <code className="text-sm bg-warning-subtle px-2 py-1 rounded font-mono text-text-primary">
                            {showPassword[cred.position_id] ? cred.plaintext_password : '••••••••••••'}
                          </code>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setShowPassword(prev => ({ ...prev, [cred.position_id]: !prev[cred.position_id] }))}
                            className="h-6 w-6 p-0"
                          >
                            {showPassword[cred.position_id] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => copyToClipboard(cred.plaintext_password, cred.email)}
                            className="h-6 w-6 p-0"
                          >
                            {copiedEmail === cred.email ? '✓' : '📋'}
                          </Button>
                          <span className="text-xs text-warning ml-2">⚠️ Shown once - share immediately</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Lock className="h-4 w-4 text-text-secondary" />
                          <span className="text-sm text-text-secondary italic">Password already viewed - request reset to share again</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <Dialog open={resetDialogOpen && resetPositionId === cred.position_id} onOpenChange={setResetDialogOpen}>
                    <DialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setResetPositionId(cred.position_id)}
                        className="border-border"
                      >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Reset Password
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-md">
                      <DialogHeader>
                        <DialogTitle>Reset Password for {cred.position_title}?</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <p className="text-sm text-text-secondary">
                          A new random password will be generated. The employee will need to change it on first login.
                        </p>
                        <div className="flex gap-3">
                          <Button
                            variant="outline"
                            onClick={() => {
                              setResetDialogOpen(false);
                              setResetPositionId(null);
                            }}
                            className="flex-1"
                          >
                            Cancel
                          </Button>
                          <Button
                            onClick={() => resetPasswordMutation.mutate(cred.position_id)}
                            disabled={resetPasswordMutation.isPending}
                            className="flex-1 bg-accent hover:bg-accent-hover"
                          >
                            {resetPasswordMutation.isPending ? 'Resetting...' : 'Reset'}
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="border border-border bg-bg-surface p-8 text-center">
            <Lock className="mx-auto mb-3 h-8 w-8 text-text-secondary" />
            <p className="text-text-secondary">No positions created yet</p>
            <p className="text-sm text-text-secondary mt-1">Create positions in the Onboarding setup to generate credentials</p>
          </Card>
        )}
      </div>
    );
  }

  // ============================================================
  // MANAGER/WORKER VIEW: Team Members List
  // ============================================================
  const team = teamQuery.data?.items || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-text-primary">
            {isManager ? "Team Members" : "My Team"}
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            {isManager ? "Manage your direct reports" : `${team.length} members`}
          </p>
        </div>
      </div>

      {/* Team Overview Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border border-border bg-bg-surface p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-text-secondary">Total Members</p>
              <p className="mt-1 text-2xl font-bold text-text-primary">{team.length}</p>
            </div>
            <Users className="h-6 w-6 text-accent" />
          </div>
        </Card>

        <Card className="border border-border bg-bg-surface p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-text-secondary">Active</p>
              <p className="mt-1 text-2xl font-bold text-text-primary">{team.filter((m) => m.status === 'active').length}</p>
            </div>
            <TrendingUp className="h-6 w-6 text-success" />
          </div>
        </Card>

        <Card className="border border-border bg-bg-surface p-4">
          <div>
            <p className="text-xs font-medium text-text-secondary">Departments</p>
            <p className="mt-1 text-2xl font-bold text-text-primary">{new Set(team.map((m) => m.department)).size}</p>
          </div>
        </Card>
      </div>

      {/* Team Members List */}
      <div className="space-y-3">
        {team.length === 0 ? (
          <Card className="border border-border bg-bg-surface p-8 text-center">
            <Users className="mx-auto mb-3 h-8 w-8 text-text-secondary" />
            <p className="text-text-secondary">No team members</p>
          </Card>
        ) : (
          team.map((member) => (
            <Card key={member.id} className="border border-border bg-bg-surface p-4 hover:bg-bg-elevated transition-colors">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4 flex-1">
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={member.avatar_url} />
                    <AvatarFallback className="bg-accent text-white">{getInitials(member.full_name)}</AvatarFallback>
                  </Avatar>

                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-text-primary">{member.full_name}</h3>
                      <Badge className={member.status === 'active' ? 'bg-success-subtle text-success' : 'bg-bg-subtle text-text-secondary'}>
                        {member.status || 'inactive'}
                      </Badge>
                    </div>
                    <p className="text-sm text-text-secondary">{member.role}</p>
                    <div className="mt-1 flex flex-wrap gap-3 text-xs text-text-secondary">
                      {member.email && (
                        <div className="flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          {member.email}
                        </div>
                      )}
                      {member.department && (
                        <div className="flex items-center gap-1">
                          <span>{member.department}</span>
                        </div>
                      )}
                      {member.current_load !== undefined && (
                        <div className="flex items-center gap-1">
                          <TrendingUp className="h-3 w-3" />
                          {member.current_load} tasks
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {isManager && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="border-border bg-bg-surface">
                      <DropdownMenuItem className="text-text-primary hover:bg-bg-elevated cursor-pointer">View Profile</DropdownMenuItem>
                      <DropdownMenuItem className="text-text-primary hover:bg-bg-elevated cursor-pointer">Assign Task</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
