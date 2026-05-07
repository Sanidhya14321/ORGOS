'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { apiFetch } from '@/lib/api';
import Stepper, { Step } from '@/components/ui/stepper';
import { Users, Plus, Mail, Phone, MapPin, TrendingUp, MoreVertical, Search } from 'lucide-react';
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

interface AvailableEmployee {
  id: string;
  full_name: string;
  email: string;
  role: string;
  department?: string;
}

interface TeamResponse {
  members: TeamMember[];
}

export default function TeamPage() {
  const browserRole = typeof window !== "undefined" ? getRoleFromBrowser() : null;
  const isCEO = browserRole?.toLowerCase() === "ceo";

  const teamQuery = useQuery<TeamResponse>({
    queryKey: ['team'],
    queryFn: () => apiFetch('/api/team'),
  });

  const availableEmployeesQuery = useQuery<AvailableEmployee[]>({
    queryKey: ['available-employees'],
    queryFn: async () => {
      const userRes = await apiFetch<{ org_id: string }>('/api/me');
      const result = await apiFetch<{ items: AvailableEmployee[] }>(`/api/orgs/${userRes.org_id}/accounts`);
      return result.items ?? [];
    },
    enabled: !isCEO
  });

  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');

  const queryClient = useQueryClient();

  const filteredEmployees = useMemo(() => {
    if (!availableEmployeesQuery.data) return [];
    return availableEmployeesQuery.data.filter((emp: AvailableEmployee) =>
      emp.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      emp.email.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [availableEmployeesQuery.data, searchQuery]);

  const addMemberMutation = useMutation({
    mutationFn: (employeeId: string) =>
      apiFetch('/api/team/members', {
        method: 'POST',
        body: JSON.stringify({ employee_id: employeeId })
      }),
    onSuccess: () => {
      toast.success('Team member added');
      setOpen(false);
      setSearchQuery('');
      setSelectedEmployeeId('');
      void queryClient.invalidateQueries({ queryKey: ['team'] });
      void queryClient.invalidateQueries({ queryKey: ['available-employees'] });
    },
    onError: (err) => {
      const msg = (err as any)?.message || 'Failed to add team member';
      toast.error(msg);
    }
  });

  const removeMemberMutation = useMutation({
    mutationFn: (memberId: string) =>
      apiFetch(`/api/team/members/${memberId}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Team member removed');
      void queryClient.invalidateQueries({ queryKey: ['team'] });
      void queryClient.invalidateQueries({ queryKey: ['available-employees'] });
    },
    onError: (err) => {
      const msg = (err as any)?.message || 'Failed to remove team member';
      toast.error(msg);
    }
  });

  if (teamQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-32" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  const team = teamQuery.data?.members || [];

  const getInitials = (name: string) =>
    name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          {isCEO ? (
            <>
              <h1 className="text-3xl font-bold text-text-primary">Teams</h1>
              <p className="mt-1 text-sm text-text-secondary">Create and manage organizational teams</p>
            </>
          ) : (
            <>
              <h1 className="text-3xl font-bold text-text-primary">My Team</h1>
              <p className="mt-1 text-sm text-text-secondary">{team.length} members</p>
            </>
          )}
        </div>
        {!isCEO && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="bg-accent hover:bg-accent-hover">
                <Plus className="mr-2 h-4 w-4" />
                Add Member
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Add Team Member</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="relative">
                  <Search className="absolute left-2 top-3 h-4 w-4 text-text-secondary" />
                  <Input
                    placeholder="Search by name or email..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="border-border bg-bg-subtle pl-8"
                  />
                </div>
                {filteredEmployees.length === 0 ? (
                  <div className="text-center py-6">
                    <p className="text-sm text-text-secondary">
                      {searchQuery ? 'No employees found' : 'Start typing to search employees'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {filteredEmployees.map((emp) => (
                      <div
                        key={emp.id}
                        className="flex items-center justify-between rounded-md border border-border bg-bg-subtle p-3 hover:bg-bg-elevated cursor-pointer transition-colors"
                        onClick={() => {
                          setSelectedEmployeeId(emp.id);
                          addMemberMutation.mutate(emp.id);
                        }}
                      >
                        <div className="flex-1">
                          <p className="text-sm font-medium text-text-primary">{emp.full_name}</p>
                          <p className="text-xs text-text-secondary">{emp.email}</p>
                          {emp.department && (
                            <p className="text-xs text-text-secondary mt-1">{emp.department}</p>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={addMemberMutation.isPending && selectedEmployeeId === emp.id}
                          className="ml-2"
                        >
                          {addMemberMutation.isPending && selectedEmployeeId === emp.id ? 'Adding...' : 'Add'}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {isCEO && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-text-primary">Create a New Team</h2>
              <p className="text-sm text-text-secondary mt-1">Organize your organization with teams and assign members</p>
            </div>
            <Button className="bg-accent hover:bg-accent-hover">
              <Plus className="mr-2 h-4 w-4" />
              Create Team
            </Button>
          </div>
          <div className="rounded-md border border-border bg-bg-surface p-6 text-center">
            <Users className="mx-auto mb-3 h-8 w-8 text-accent" />
            <h3 className="font-semibold text-text-primary mb-1">Teams Dashboard</h3>
            <p className="text-sm text-text-secondary">
              Teams you create will appear here. You can manage members, settings, and team structure.
            </p>
          </div>
        </div>
      )}

      {!isCEO && (
        <>
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
                  <p className="text-xs font-medium text-text-secondary">Active Today</p>
                  <p className="mt-1 text-2xl font-bold text-text-primary">{team.filter((m: any) => m.status === 'active').length}</p>
                </div>
                <TrendingUp className="h-6 w-6 text-success" />
              </div>
            </Card>

            <Card className="border border-border bg-bg-surface p-4">
              <div>
                <p className="text-xs font-medium text-text-secondary">Departments</p>
                <p className="mt-1 text-2xl font-bold text-text-primary">{new Set(team.map((m: any) => m.department)).size}</p>
              </div>
            </Card>
          </div>

          {/* Team Members List */}
          <div className="space-y-3">
            {team.length === 0 ? (
              <Card className="border border-border bg-bg-surface p-8 text-center">
                <Users className="mx-auto mb-3 h-8 w-8 text-text-secondary" />
                <p className="text-text-secondary">No team members yet</p>
              </Card>
            ) : (
              team.map((member: any) => (
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

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="border-border bg-bg-surface">
                        <DropdownMenuItem className="text-text-primary hover:bg-bg-elevated cursor-pointer">View Profile</DropdownMenuItem>
                        <DropdownMenuItem className="text-text-primary hover:bg-bg-elevated cursor-pointer">Edit Role</DropdownMenuItem>
                        <DropdownMenuItem className="text-text-primary hover:bg-bg-elevated cursor-pointer">Assign Tasks</DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-danger hover:bg-danger-subtle cursor-pointer"
                          onClick={() => {
                            if (window.confirm(`Remove ${member.full_name} from the team?`)) {
                              removeMemberMutation.mutate(member.id);
                            }
                          }}
                        >
                          Remove from Team
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </Card>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );}
