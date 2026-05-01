'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Bell, Lock, Eye, Clock, Mail, Save, 
  RotateCcw, AlertCircle, Check, ShieldCheck, 
  Globe, Moon, ChevronRight, UserCircle 
} from 'lucide-react';
import { UserPreferences, UserPreferencesUpdate } from '@orgos/shared-types';

export default function SettingsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const prefsQuery = useQuery({
    queryKey: ['settings', 'preferences'],
    queryFn: () => apiFetch<{ prefs: UserPreferences }>('/api/settings/preferences'),
  });

  const preferences = prefsQuery.data?.prefs;
  const [localPrefs, setLocalPrefs] = useState<UserPreferencesUpdate>({});

  useEffect(() => {
    if (preferences) {
      setLocalPrefs({
        theme: preferences.theme as any,
        language: preferences.language as any,
        time_format: preferences.time_format as any,
        email_notifications: preferences.email_notifications,
        task_assigned: preferences.task_assigned,
        task_updated: preferences.task_updated,
        sla_breached: preferences.sla_breached,
        interview_scheduled: preferences.interview_scheduled,
        meeting_digest: preferences.meeting_digest,
      });
    }
  }, [preferences]);

  const updatePrefsMutation = useMutation({
    mutationFn: (updates: UserPreferencesUpdate) =>
      apiFetch('/api/settings/preferences', { method: 'PATCH', body: JSON.stringify(updates) }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['settings', 'preferences'] });
      setSuccessMessage('Settings saved successfully!');
      setTimeout(() => setSuccessMessage(null), 3000);
    },
    onError: () => {
      setErrorMessage('Failed to save settings');
      setTimeout(() => setErrorMessage(null), 3000);
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: (passwords: { current_password: string; new_password: string }) =>
      apiFetch('/api/settings/change-password', { method: 'POST', body: JSON.stringify(passwords) }),
    onSuccess: () => {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowPasswordModal(false);
      setSuccessMessage('Password changed successfully!');
      setTimeout(() => setSuccessMessage(null), 3000);
    },
    onError: () => {
      setErrorMessage('Failed to change password');
      setTimeout(() => setErrorMessage(null), 3000);
    },
  });

  const handleSavePreferences = () => updatePrefsMutation.mutate(localPrefs);

  const handleResetPreferences = () => {
    if (preferences) {
      setLocalPrefs({
        theme: preferences.theme as any,
        language: preferences.language as any,
        time_format: preferences.time_format as any,
        email_notifications: preferences.email_notifications,
        task_assigned: preferences.task_assigned,
        task_updated: preferences.task_updated,
        sla_breached: preferences.sla_breached,
        interview_scheduled: preferences.interview_scheduled,
        meeting_digest: preferences.meeting_digest,
      });
    }
  };

  const handleChangePassword = () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      setErrorMessage('All fields are required');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMessage('Passwords do not match');
      return;
    }
    changePasswordMutation.mutate({ current_password: currentPassword, new_password: newPassword });
  };

  if (prefsQuery.isLoading) {
    return (
      <div className="max-w-5xl mx-auto space-y-6">
        <Skeleton className="h-12 w-64 bg-bg-subtle" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Skeleton className="h-48 col-span-1 bg-bg-subtle" />
          <Skeleton className="h-96 col-span-3 bg-bg-subtle" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-text-primary tracking-tight">Account Settings</h1>
          <p className="text-text-secondary mt-1">Configure your workspace experience and security</p>
        </div>
        <div className="flex gap-3">
          <Button 
            variant="outline" 
            className="border-border text-text-secondary hover:bg-bg-elevated"
            onClick={handleResetPreferences}
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Reset
          </Button>
          <Button 
            className="bg-accent hover:bg-accent/90 text-white shadow-lg shadow-accent/20"
            onClick={handleSavePreferences}
            disabled={updatePrefsMutation.isPending}
          >
            <Save className="mr-2 h-4 w-4" />
            {updatePrefsMutation.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>

      {/* Feedback Messages */}
      <div className="fixed top-24 right-8 z-50 flex flex-col gap-2">
        {successMessage && (
          <div className="flex items-center gap-3 px-4 py-3 bg-green-500/10 border border-green-500/20 rounded-lg text-green-600 animate-in fade-in slide-in-from-right-4">
            <Check className="h-5 w-5" />
            <p className="text-sm font-medium">{successMessage}</p>
          </div>
        )}
        {errorMessage && (
          <div className="flex items-center gap-3 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-600 animate-in fade-in slide-in-from-right-4">
            <AlertCircle className="h-5 w-5" />
            <p className="text-sm font-medium">{errorMessage}</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
        {/* Sidebar Nav (Visual) */}
        <div className="md:col-span-3 space-y-1">
          <nav className="flex flex-col gap-1">
            <Button variant="ghost" className="justify-start text-accent bg-accent/5 font-semibold">
              <UserCircle className="mr-2 h-4 w-4" /> General
            </Button>
            <Button variant="ghost" className="justify-start text-text-secondary hover:text-text-primary">
              <Bell className="mr-2 h-4 w-4" /> Notifications
            </Button>
            <Button variant="ghost" className="justify-start text-text-secondary hover:text-text-primary">
              <ShieldCheck className="mr-2 h-4 w-4" /> Security
            </Button>
          </nav>
        </div>

        {/* Content Area */}
        <div className="md:col-span-9 space-y-8">
          
          {/* Notification Preferences */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 px-1 text-text-primary">
              <Bell className="h-5 w-5 text-accent" />
              <h2 className="text-lg font-bold">Notifications</h2>
            </div>
            <Card className="border border-border bg-bg-surface overflow-hidden">
              <div className="p-6 space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-text-primary">Global Email Notifications</p>
                    <p className="text-sm text-text-secondary">Master switch for all automated email updates</p>
                  </div>
                  <Switch 
                    checked={localPrefs.email_notifications ?? false}
                    onCheckedChange={(checked) => setLocalPrefs({...localPrefs, email_notifications: checked})} 
                  />
                </div>

                {localPrefs.email_notifications && (
                  <div className="grid grid-cols-1 gap-4 p-4 bg-bg-subtle/50 rounded-xl border border-border animate-in fade-in zoom-in-95 duration-200">
                    {[
                      { key: 'task_assigned', label: 'Task Assigned', desc: 'Alert when a new task is in your queue' },
                      { key: 'task_updated', label: 'Task Updated', desc: 'Changes to tasks you are watching' },
                      { key: 'sla_breached', label: 'SLA Breached', desc: 'Urgent alerts for missed deadlines' },
                      { key: 'interview_scheduled', label: 'Recruitment', desc: 'New interview and candidate updates' },
                    ].map((item) => (
                      <div key={item.key} className="flex items-center justify-between">
                        <div className="pr-4">
                          <p className="text-sm font-medium text-text-primary">{item.label}</p>
                          <p className="text-xs text-text-secondary">{item.desc}</p>
                        </div>
                        <Switch 
                          className="scale-90"
                          checked={(localPrefs as any)[item.key] ?? false}
                          onCheckedChange={(checked) => setLocalPrefs({...localPrefs, [item.key]: checked})} 
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          </section>

          {/* Display Preferences */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 px-1 text-text-primary">
              <Eye className="h-5 w-5 text-accent" />
              <h2 className="text-lg font-bold">Display & Language</h2>
            </div>
            <Card className="border border-border bg-bg-surface p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-text-secondary flex items-center gap-2">
                      <Moon className="h-3.5 w-3.5" /> Appearance
                    </label>
                    <div className="flex items-center gap-3 p-1.5 bg-bg-subtle border border-border rounded-lg w-fit">
                      <Button size="sm" className="bg-accent text-white h-8">Dark</Button>
                      <span className="text-[10px] uppercase font-bold text-text-secondary px-2 opacity-50 cursor-not-allowed">Light (Coming Soon)</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-text-secondary flex items-center gap-2">
                      <Globe className="h-3.5 w-3.5" /> Language
                    </label>
                    <Select 
                      value={localPrefs.language as string || 'en'}
                      onValueChange={(value) => setLocalPrefs({...localPrefs, language: value as any})}
                    >
                      <SelectTrigger className="w-full bg-bg-subtle border-border">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="en">English (US)</SelectItem>
                        <SelectItem value="es">Español</SelectItem>
                        <SelectItem value="fr">Français</SelectItem>
                        <SelectItem value="de">Deutsch</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-text-secondary flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5" /> Time Format
                    </label>
                    <Select 
                      value={localPrefs.time_format as string || '24h'}
                      onValueChange={(value) => setLocalPrefs({...localPrefs, time_format: value as any})}
                    >
                      <SelectTrigger className="w-full bg-bg-subtle border-border">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="24h">24-hour (14:30)</SelectItem>
                        <SelectItem value="12h">12-hour (2:30 PM)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </Card>
          </section>

          {/* Security Settings */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 px-1 text-text-primary">
              <Lock className="h-5 w-5 text-accent" />
              <h2 className="text-lg font-bold">Security</h2>
            </div>
            <Card className="border border-border bg-bg-surface overflow-hidden">
              <div className="divide-y divide-border">
                <button 
                  onClick={() => setShowPasswordModal(true)}
                  className="w-full flex items-center justify-between p-4 hover:bg-bg-subtle transition-colors group"
                >
                  <div className="flex items-center gap-4 text-left">
                    <div className="h-10 w-10 rounded-lg bg-accent/5 flex items-center justify-center text-accent">
                      <Lock className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-text-primary">Account Password</p>
                      <p className="text-xs text-text-secondary">Update your credentials to stay secure</p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-text-secondary group-hover:translate-x-1 transition-transform" />
                </button>

                <button 
                  onClick={() => router.push('/settings/security')}
                  className="w-full flex items-center justify-between p-4 hover:bg-bg-subtle transition-colors group"
                >
                  <div className="flex items-center gap-4 text-left">
                    <div className="h-10 w-10 rounded-lg bg-accent/5 flex items-center justify-center text-accent">
                      <Clock className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-text-primary">Active Sessions</p>
                      <p className="text-xs text-text-secondary">Manage logged-in devices and apps</p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-text-secondary group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </Card>
          </section>

        </div>
      </div>

      {/* Change Password Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] animate-in fade-in duration-300">
          <Card className="border border-border bg-bg-surface p-8 w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="mb-6">
              <h3 className="text-xl font-bold text-text-primary">Change Password</h3>
              <p className="text-sm text-text-secondary">Choose a strong, unique password</p>
            </div>
            
            <div className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-text-secondary uppercase">Current Password</label>
                <Input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="border-border bg-bg-subtle focus:ring-accent/50"
                  placeholder="••••••••"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-text-secondary uppercase">New Password</label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="border-border bg-bg-subtle focus:ring-accent/50"
                  placeholder="••••••••"
                />
                <p className="text-[10px] text-text-secondary italic">Minimum 8 characters with numbers/symbols</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-text-secondary uppercase">Confirm Password</label>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="border-border bg-bg-subtle focus:ring-accent/50"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-8">
              <Button
                variant="outline"
                className="flex-1 border-border text-text-secondary"
                onClick={() => setShowPasswordModal(false)}
                disabled={changePasswordMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 bg-accent hover:bg-accent/90 text-white"
                onClick={handleChangePassword}
                disabled={changePasswordMutation.isPending}
              >
                {changePasswordMutation.isPending ? 'Updating...' : 'Update Password'}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}