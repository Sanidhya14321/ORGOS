'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { apiFetch } from '@/lib/api';
import { 
  Check, X, Mail, Calendar, AlertCircle, Users, MapPin, DollarSign,
  CheckCircle2, FileText, Send
} from 'lucide-react';
import { toast } from 'sonner';

interface PendingApplicant {
  id: string;
  email: string;
  full_name: string;
  position_id?: string;
  reports_to?: string;
  status: 'pending' | 'active' | 'rejected' | 'inactive';
  created_at: string;
}

interface Position {
  id: string;
  title: string;
  level: number;
  confirmed: boolean;
}

function ApproveDialog({ applicant, open, onOpenChange, onApproved }: { applicant: PendingApplicant; open: boolean; onOpenChange: (open: boolean) => void; onApproved: () => void }) {
  const [domainOverride, setDomainOverride] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);

  const approveMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ status: string; password?: string }>(`/api/orgs/members/${applicant.id}/approve`, {
        method: 'POST',
        body: JSON.stringify({
          overrideDomainMismatch: domainOverride
        })
      }),
    onSuccess: async (data) => {
      // If password was returned, display it
      if (data.password) {
        setGeneratedPassword(data.password);
      }
      toast.success('Applicant approved! Welcome email sent.');
      onApproved();
      setTimeout(() => {
        onOpenChange(false);
        setGeneratedPassword(null);
        setShowPassword(false);
      }, 2000);
    },
    onError: (err) => {
      const msg = (err as any)?.message || 'Failed to approve applicant';
      if (msg.includes('domain')) {
        toast.error('Email domain mismatch. Check the override option to proceed.');
      } else {
        toast.error(msg);
      }
    }
  });

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Approve Applicant</DialogTitle>
        <DialogDescription>
          Approve {applicant.full_name} ({applicant.email}) to join the organization
        </DialogDescription>
      </DialogHeader>

      {generatedPassword ? (
        <div className="space-y-4 py-4">
          <Card className="border-green-200 bg-green-50 p-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-semibold text-green-900">Applicant approved successfully!</p>
                <p className="text-sm text-green-700 mt-1">
                  A welcome email with login credentials has been sent to {applicant.email}.
                </p>
              </div>
            </div>
          </Card>

          <div className="space-y-2">
            <label className="text-sm font-medium text-text-primary">
              Temporary Password (shown once):
            </label>
            <div className="flex gap-2">
              <div className="flex-1 px-3 py-2 border border-border rounded-md bg-bg-surface font-mono text-sm">
                {showPassword ? generatedPassword : '••••••••'}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(generatedPassword);
                  toast.success('Password copied to clipboard');
                }}
              >
                Copy
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? 'Hide' : 'Show'}
              </Button>
            </div>
          </div>

          <div className="text-xs text-text-secondary bg-blue-50 border border-blue-200 rounded p-3">
            <p className="font-semibold text-blue-900 mb-1">💡 Tips:</p>
            <ul className="space-y-1 text-blue-700">
              <li>• Share this password securely with the applicant</li>
              <li>• They'll be required to change it on first login</li>
              <li>• This password will be permanently deleted after first use</li>
            </ul>
          </div>
        </div>
      ) : (
        <div className="space-y-4 py-4">
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium text-text-primary">Email</p>
              <p className="text-sm text-text-secondary">{applicant.email}</p>
            </div>

            <div>
              <p className="text-sm font-medium text-text-primary">Full Name</p>
              <p className="text-sm text-text-secondary">{applicant.full_name}</p>
            </div>

            {applicant.position_id && (
              <div>
                <p className="text-sm font-medium text-text-primary">Assigned Position</p>
                <p className="text-sm text-text-secondary">Position #{applicant.position_id.slice(0, 8)}</p>
              </div>
            )}

            <div className="pt-3 border-t border-border">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={domainOverride}
                  onChange={(e) => setDomainOverride(e.target.checked)}
                  className="h-4 w-4 rounded border-border"
                />
                <span className="text-sm font-medium text-text-primary">
                  Override domain mismatch (if applicable)
                </span>
              </label>
              <p className="text-xs text-text-secondary mt-1 ml-6">
                Check this if the applicant's email domain differs from your organization domain.
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={() => approveMutation.mutate()}
              disabled={approveMutation.isPending}
              className="flex-1 bg-accent hover:bg-accent-hover"
            >
              {approveMutation.isPending ? 'Approving...' : 'Approve & Send Welcome Email'}
            </Button>
          </div>
        </div>
      )}
    </DialogContent>
  );
}

export default function RecruitmentPage() {
  const [approveOpen, setApproveOpen] = useState(false);
  const [selectedApplicant, setSelectedApplicant] = useState<PendingApplicant | null>(null);

  const queryClient = useQueryClient();

  // Fetch pending applicants
  const applicantsQuery = useQuery({
    queryKey: ['pending-applicants'],
    queryFn: () =>
      apiFetch<{ items: PendingApplicant[] }>('/api/orgs/pending-members'),
    select: (data) => data.items || []
  });

  // Reject applicant mutation
  const rejectMutation = useMutation({
    mutationFn: (applicantId: string) =>
      apiFetch(`/api/orgs/members/${applicantId}/reject`, {
        method: 'POST',
        body: JSON.stringify({
          reason: 'Application rejected by administrator'
        })
      }),
    onSuccess: () => {
      toast.success('Applicant rejected');
      void queryClient.invalidateQueries({ queryKey: ['pending-applicants'] });
    },
    onError: (err) => {
      const msg = (err as any)?.message || 'Failed to reject applicant';
      toast.error(msg);
    }
  });

  const handleApprove = (applicant: PendingApplicant) => {
    setSelectedApplicant(applicant);
    setApproveOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-text-primary">Recruitment</h1>
          <p className="mt-1 text-sm text-text-secondary">Approve pending applicants and send welcome emails</p>
        </div>
      </div>

      {/* Stats */}
      {applicantsQuery.data && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-border bg-bg-surface p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-text-secondary">Pending Applicants</p>
                <p className="text-3xl font-bold text-text-primary mt-2">{applicantsQuery.data.length}</p>
              </div>
              <Users className="h-8 w-8 text-accent" />
            </div>
          </Card>

          <Card className="border-border bg-bg-surface p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-text-secondary">Awaiting Review</p>
                <p className="text-3xl font-bold text-text-primary mt-2">
                  {applicantsQuery.data.filter((a) => a.status === 'pending').length}
                </p>
              </div>
              <FileText className="h-8 w-8 text-amber-500" />
            </div>
          </Card>

          <Card className="border-border bg-bg-surface p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-text-secondary">Processing Time</p>
                <p className="text-3xl font-bold text-text-primary mt-2">&lt; 2 min</p>
              </div>
              <Calendar className="h-8 w-8 text-green-500" />
            </div>
          </Card>
        </div>
      )}

      {/* Applicants List */}
      <div>
        <h2 className="text-lg font-semibold text-text-primary mb-4">Applicants</h2>

        {applicantsQuery.isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        ) : applicantsQuery.data && applicantsQuery.data.length > 0 ? (
          <div className="space-y-3">
            {applicantsQuery.data.map((applicant) => (
              <Card key={applicant.id} className="border-border p-4 hover:bg-bg-elevated transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4 flex-1 min-w-0">
                    <Avatar className="h-12 w-12 flex-shrink-0 mt-1">
                      <AvatarImage
                        src={`https://api.dicebear.com/7.x/initials/svg?seed=${applicant.full_name}`}
                      />
                      <AvatarFallback>{applicant.full_name.slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>

                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-text-primary">{applicant.full_name}</h3>

                      <div className="mt-1 flex items-center gap-2 text-sm text-text-secondary">
                        <Mail className="h-4 w-4 flex-shrink-0" />
                        <span className="truncate">{applicant.email}</span>
                      </div>

                      <div className="mt-2 flex items-center gap-2 flex-wrap">
                        <Badge className="bg-blue-50 text-blue-700">Pending Review</Badge>
                        <span className="text-xs text-text-secondary">
                          Applied {new Date(applicant.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2 flex-shrink-0">
                    <Dialog open={selectedApplicant?.id === applicant.id && approveOpen} onOpenChange={setApproveOpen}>
                      <DialogTrigger asChild>
                        <Button
                          onClick={() => handleApprove(applicant)}
                          size="sm"
                          className="bg-green-600 hover:bg-green-700 text-white"
                        >
                          <Check className="h-4 w-4 mr-1" />
                          Approve
                        </Button>
                      </DialogTrigger>
                      {selectedApplicant && (
                        <ApproveDialog
                          applicant={selectedApplicant}
                          open={selectedApplicant.id === applicant.id && approveOpen}
                          onOpenChange={setApproveOpen}
                          onApproved={() => {
                            void queryClient.invalidateQueries({ queryKey: ['pending-applicants'] });
                          }}
                        />
                      )}
                    </Dialog>

                    <Button
                      onClick={() => rejectMutation.mutate(applicant.id)}
                      disabled={rejectMutation.isPending}
                      size="sm"
                      variant="outline"
                      className="text-red-600 hover:bg-red-50"
                    >
                      <X className="h-4 w-4 mr-1" />
                      Reject
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="border-border bg-bg-surface p-12 text-center">
            <Users className="mx-auto mb-3 h-8 w-8 text-text-secondary" />
            <p className="text-text-secondary">No pending applicants</p>
            <p className="text-xs text-text-secondary mt-1">New applicants will appear here for approval</p>
          </Card>
        )}
      </div>

      {/* Welcome Email Template Info */}
      <Card className="border-border bg-blue-50 p-6">
        <h3 className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
          <Send className="h-5 w-5" />
          Welcome Email Process
        </h3>
        <div className="text-sm text-blue-700 space-y-2">
          <p>When you approve an applicant:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>A temporary password is generated securely</li>
            <li>Welcome email is sent with login credentials</li>
            <li>Applicant must change password on first login</li>
            <li>All account activity is automatically audited</li>
          </ul>
        </div>
      </Card>
    </div>
  );
}
