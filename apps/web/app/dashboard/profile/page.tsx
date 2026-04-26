'use client';

import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch } from '@/lib/api';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Mail, Phone, MapPin, Building2, Calendar, Edit } from 'lucide-react';

interface UserProfile {
  id?: string;
  full_name: string;
  email: string;
  phone?: string;
  avatar_url?: string;
  role: string;
  org_name?: string;
  created_at?: string;
  current_load?: number;
  department?: string;
  reporting_to_name?: string;
  skills?: string[];
}

export default function ProfilePage() {
  const meQuery = useQuery<UserProfile>({
    queryKey: ['me'],
    queryFn: () => apiFetch('/api/me')
  });

  if (meQuery.isLoading) {
    return (
      <div className="max-w-2xl">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="mt-4 h-20 w-full" />
      </div>
    );
  }

  const user = meQuery.data;
  if (!user) return null;

  const initials = user.full_name
    ?.split(' ')
    .map((n: string) => n[0])
    .join('')
    .toUpperCase() || '?';

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <h1 className="text-3xl font-bold text-text-primary">Profile</h1>
        <Button className="bg-accent hover:bg-accent-hover">
          <Edit className="mr-2 h-4 w-4" />
          Edit Profile
        </Button>
      </div>

      {/* Main Profile Card */}
      <Card className="border border-border bg-bg-surface p-6">
        <div className="flex gap-6">
          <Avatar className="h-24 w-24">
            <AvatarImage src={user.avatar_url} />
            <AvatarFallback className="bg-accent text-white text-lg font-bold">{initials}</AvatarFallback>
          </Avatar>
          
          <div className="flex-1">
            <div className="mb-3 flex items-center gap-2">
              <h2 className="text-2xl font-bold text-text-primary">{user.full_name}</h2>
              <Badge className="bg-accent-subtle text-accent">{user.role}</Badge>
            </div>
            
            <div className="mb-4 flex gap-6 text-sm text-text-secondary">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                {user.email}
              </div>
              {user.phone && (
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  {user.phone}
                </div>
              )}
            </div>

            {user.org_name && (
              <div className="flex items-center gap-2 text-sm text-text-secondary">
                <Building2 className="h-4 w-4" />
                {user.org_name}
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Details Grid */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border border-border bg-bg-surface p-4">
          <p className="text-xs font-medium text-text-secondary mb-2">Account Status</p>
          <Badge className="bg-success-subtle text-success">Active</Badge>
          <p className="mt-2 text-xs text-text-secondary">
            <Calendar className="inline h-3 w-3 mr-1" />
            Member since {user.created_at ? new Date(user.created_at).toLocaleDateString() : 'Unknown'}
          </p>
        </Card>

        <Card className="border border-border bg-bg-surface p-4">
          <p className="text-xs font-medium text-text-secondary mb-2">Current Load</p>
          <p className="text-2xl font-bold text-text-primary">{user.current_load || 0}</p>
          <p className="text-xs text-text-secondary">tasks in progress</p>
        </Card>

        {user.department && (
          <Card className="border border-border bg-bg-surface p-4">
            <p className="text-xs font-medium text-text-secondary mb-2">Department</p>
            <p className="text-lg font-semibold text-text-primary">{user.department}</p>
          </Card>
        )}

        {user.reporting_to_name && (
          <Card className="border border-border bg-bg-surface p-4">
            <p className="text-xs font-medium text-text-secondary mb-2">Reports To</p>
            <p className="text-lg font-semibold text-text-primary">{user.reporting_to_name}</p>
          </Card>
        )}
      </div>

      {/* Skills Section */}
      {user.skills && user.skills.length > 0 && (
        <Card className="border border-border bg-bg-surface p-4">
          <p className="mb-3 text-sm font-medium text-text-primary">Skills</p>
          <div className="flex flex-wrap gap-2">
            {user.skills.map((skill: string) => (
              <Badge key={skill} className="bg-accent-subtle text-accent">
                {skill}
              </Badge>
            ))}
          </div>
        </Card>
      )}

      {/* Actions */}
      <Card className="border border-border bg-bg-surface p-4">
        <p className="mb-3 text-sm font-medium text-text-primary">Account Actions</p>
        <div className="flex gap-2">
          <Button variant="outline" className="border-border hover:bg-bg-elevated">
            Change Password
          </Button>
          <Button variant="outline" className="border-border hover:bg-bg-elevated">
            Connected Apps
          </Button>
          <Button variant="outline" className="border-danger text-danger hover:bg-danger-subtle">
            Sign Out Other Sessions
          </Button>
        </div>
      </Card>
    </div>
  );
}
