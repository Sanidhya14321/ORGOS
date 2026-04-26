'use client';

import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { apiFetch } from '@/lib/api';
import { Users, Plus, Mail, Phone, MapPin, TrendingUp, MoreVertical } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

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

interface TeamResponse {
  members: TeamMember[];
}

export default function TeamPage() {
  const teamQuery = useQuery<TeamResponse>({
    queryKey: ['team'],
    queryFn: () => apiFetch('/api/team'),
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
          <h1 className="text-3xl font-bold text-text-primary">Team</h1>
          <p className="mt-1 text-sm text-text-secondary">{team.length} members</p>
        </div>
        <Button className="bg-accent hover:bg-accent-hover">
          <Plus className="mr-2 h-4 w-4" />
          Add Member
        </Button>
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
                    <DropdownMenuItem className="text-text-primary hover:bg-bg-elevated">View Profile</DropdownMenuItem>
                    <DropdownMenuItem className="text-text-primary hover:bg-bg-elevated">Edit Role</DropdownMenuItem>
                    <DropdownMenuItem className="text-text-primary hover:bg-bg-elevated">Assign Tasks</DropdownMenuItem>
                    <DropdownMenuItem className="text-danger hover:bg-danger-subtle">Remove from Team</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
