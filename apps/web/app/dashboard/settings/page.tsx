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
import { cn } from '@/lib/utils';
import { useTheme } from '@/components/providers/theme-provider';
import type { ThemePreference } from '@/lib/theme';
import { 
  Bell, Lock, Eye, Clock, Mail, Save, 
  RotateCcw, AlertCircle, Check, ShieldCheck, 
  Globe, Moon, ChevronRight, UserCircle 
} from 'lucide-react';
import { UserPreferences, UserPreferencesUpdate } from '@orgos/shared-types';

// Define the available tab types
type SettingsTab = 'general' | 'notifications' | 'security';

export default function SettingsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { themePreference, setThemePreference } = useTheme();
  
  // Tab State
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  
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

  useEffect(() => {
    if (preferences?.theme) {
      setThemePreference(preferences.theme);
    }
  }, [preferences?.theme, setThemePreference]);

  const updatePrefsMutation = useMutation({
    mutationFn: (updates: UserPreferencesUpdate) =>
      apiFetch('/api/settings/preferences', { method: 'PATCH', body: JSON.stringify(updates) }),
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: ['settings', 'preferences'] });
      if (variables.theme) {
        setThemePreference(variables.theme);
      }
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

  const selectedTheme = (localPrefs.theme ?? preferences?.theme ?? themePreference ?? 'light') as ThemePreference;
  const themeOptions: Array<{ value: ThemePreference; label: string; description: string }> = [
    { value: 'light', label: 'Light', description: 'Bright, paper-like surfaces for daytime work.' },
    { value: 'dark', label: 'Dark', description: 'Low-glare control surfaces for focused sessions.' },
    { value: 'auto', label: 'Auto', description: 'Match your operating system preference automatically.' },
  ];

  if (prefsQuery.isLoading) {
    return (
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex flex-col gap-4">
          <div className="h-10 w-64 bg-bg-subtle rounded-xl animate-pulse" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="h-48 col-span-1 bg-bg-subtle rounded-xl animate-pulse" />
            <div className="h-96 col-span-3 bg-bg-subtle rounded-xl animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold text-text-primary tracking-tight">Account Settings</h1>
          <p className="text-text-secondary text-sm font-medium">Manage your workspace orchestration and delivery preferences.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button 
            variant="outline" 
            className="border-border text-text-secondary hover:bg-bg-elevated transition-all"
            onClick={handleResetPreferences}
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Reset Defaults
          </Button>
          <Button 
            className="bg-accent hover:bg-accent/90 text-white shadow-lg shadow-accent/20 transition-all active:scale-95"
            onClick={handleSavePreferences}
            disabled={updatePrefsMutation.isPending}
          >
            <Save className="mr-2 h-4 w-4" />
            {updatePrefsMutation.isPending ? 'Syncing...' : 'Save Preferences'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-10">
        {/* Navigation Sidebar - Functional Tabs */}
        <aside className="md:col-span-3">
          <nav className="flex flex-col gap-1 sticky top-8">
            <button
              onClick={() => setActiveTab('general')}
              className={cn(
                "flex items-center w-full px-4 py-3 text-xs font-bold uppercase tracking-widest rounded-xl transition-all",
                activeTab === 'general' 
                  ? "bg-accent/10 text-accent shadow-[inset_0_0_0_1px_rgba(var(--accent-rgb),0.2)]" 
                  : "text-text-secondary hover:text-text-primary hover:bg-bg-subtle"
              )}
            >
              <UserCircle className="mr-3 h-4 w-4" /> General Hub
            </button>
            <button
              onClick={() => setActiveTab('notifications')}
              className={cn(
                "flex items-center w-full px-4 py-3 text-xs font-bold uppercase tracking-widest rounded-xl transition-all",
                activeTab === 'notifications' 
                  ? "bg-accent/10 text-accent shadow-[inset_0_0_0_1px_rgba(var(--accent-rgb),0.2)]" 
                  : "text-text-secondary hover:text-text-primary hover:bg-bg-subtle"
              )}
            >
              <Bell className="mr-3 h-4 w-4" /> Notifications
            </button>
            <button
              onClick={() => setActiveTab('security')}
              className={cn(
                "flex items-center w-full px-4 py-3 text-xs font-bold uppercase tracking-widest rounded-xl transition-all",
                activeTab === 'security' 
                  ? "bg-accent/10 text-accent shadow-[inset_0_0_0_1px_rgba(var(--accent-rgb),0.2)]" 
                  : "text-text-secondary hover:text-text-primary hover:bg-bg-subtle"
              )}
            >
              <ShieldCheck className="mr-3 h-4 w-4" /> Security Log
            </button>
          </nav>
        </aside>

        {/* Content Modules - Conditional Rendering */}
        <div className="md:col-span-9">
          
          {/* 1. General Tab */}
          {activeTab === 'general' && (
            <section className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="flex items-center gap-2 px-1 text-text-primary">
                <Eye className="h-5 w-5 text-accent" />
                <h2 className="text-lg font-bold tracking-tight uppercase text-xs tracking-[0.2em]">Interface & Region</h2>
              </div>
              <Card className="border border-border bg-bg-surface p-8 rounded-2xl shadow-sm">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-10">
                  <div className="space-y-6">
                    <div className="space-y-3">
                      <label className="text-[10px] font-bold text-text-secondary uppercase tracking-[0.15em] flex items-center gap-2">
                        <Moon className="h-3.5 w-3.5" /> Aesthetic Theme
                      </label>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        {themeOptions.map((option) => {
                          const isActive = selectedTheme === option.value;
                          return (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => setLocalPrefs({ ...localPrefs, theme: option.value })}
                              className={cn(
                                "rounded-2xl border px-4 py-3 text-left transition-all",
                                isActive
                                  ? "border-accent bg-accent/10 shadow-[0_10px_24px_rgba(var(--accent-rgb),0.16)]"
                                  : "border-border bg-bg-subtle/60 hover:bg-bg-subtle"
                              )}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-sm font-semibold text-text-primary">{option.label}</span>
                                {isActive ? (
                                  <Badge className="border-transparent bg-accent text-white">Active</Badge>
                                ) : null}
                              </div>
                              <p className="mt-2 text-[11px] leading-5 text-text-secondary">{option.description}</p>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <label className="text-[10px] font-bold text-text-secondary uppercase tracking-[0.15em] flex items-center gap-2">
                        <Globe className="h-3.5 w-3.5" /> Localization
                      </label>
                      <Select 
                        value={localPrefs.language as string || 'en'}
                        onValueChange={(value) => setLocalPrefs({...localPrefs, language: value as any})}
                      >
                        <SelectTrigger className="w-full bg-bg-subtle border-border rounded-xl h-10 font-medium">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-bg-surface border-border">
                          <SelectItem value="en">English (Global)</SelectItem>
                          <SelectItem value="es">Español</SelectItem>
                          <SelectItem value="fr">Français</SelectItem>
                          <SelectItem value="de">Deutsch</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="text-[10px] font-bold text-text-secondary uppercase tracking-[0.15em] flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5" /> Chronology Format
                    </label>
                    <Select 
                      value={localPrefs.time_format as string || '24h'}
                      onValueChange={(value) => setLocalPrefs({...localPrefs, time_format: value as any})}
                    >
                      <SelectTrigger className="w-full bg-bg-subtle border-border rounded-xl h-10 font-medium">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-bg-surface border-border">
                        <SelectItem value="24h">ISO-24H (14:30)</SelectItem>
                        <SelectItem value="12h">STD-12H (2:30 PM)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </Card>
            </section>
          )}

          {/* 2. Notifications Tab */}
          {activeTab === 'notifications' && (
            <section className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="flex items-center gap-2 px-1 text-text-primary">
                <Bell className="h-5 w-5 text-accent" />
                <h2 className="text-lg font-bold tracking-tight uppercase text-xs tracking-[0.2em]">Notification Engine</h2>
              </div>
              <Card className="border border-border bg-bg-surface overflow-hidden rounded-2xl shadow-sm">
                <div className="p-6 space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-bold text-text-primary tracking-tight">Global Email Notifications</p>
                      <p className="text-xs text-text-secondary font-medium">Toggle primary delivery for all automated node updates.</p>
                    </div>
                    <Switch 
                      checked={localPrefs.email_notifications ?? false}
                      onCheckedChange={(checked) => setLocalPrefs({...localPrefs, email_notifications: checked})} 
                    />
                  </div>

                  {localPrefs.email_notifications && (
                    <div className="grid grid-cols-1 gap-4 p-5 bg-bg-subtle/50 rounded-2xl border border-border animate-in fade-in zoom-in-95 duration-300">
                      {[
                        { key: 'task_assigned', label: 'Node Assignment', desc: 'When a new execution node is routed to you.' },
                        { key: 'task_updated', label: 'Node Updates', desc: 'Alerts for changes in watched task hierarchies.' },
                        { key: 'sla_breached', label: 'SLA Exceptions', desc: 'Critical alerts for deadline breaches and risks.' },
                        { key: 'interview_scheduled', label: 'Talent Acquisition', desc: 'Reminders for scheduled recruitment sessions.' },
                      ].map((item) => (
                        <div key={item.key} className="flex items-center justify-between">
                          <div className="pr-4">
                            <p className="text-sm font-bold text-text-primary tracking-tight">{item.label}</p>
                            <p className="text-[11px] text-text-secondary font-medium">{item.desc}</p>
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
          )}

          {/* 3. Security Tab */}
          {activeTab === 'security' && (
            <section className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="flex items-center gap-2 px-1 text-text-primary">
                <Lock className="h-5 w-5 text-accent" />
                <h2 className="text-lg font-bold tracking-tight uppercase text-xs tracking-[0.2em]">Security Protocols</h2>
              </div>
              <Card className="border border-border bg-bg-surface overflow-hidden rounded-2xl shadow-sm">
                <div className="divide-y divide-border">
                  <button 
                    onClick={() => setShowPasswordModal(true)}
                    className="w-full flex items-center justify-between p-5 hover:bg-bg-subtle transition-all group text-left"
                  >
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-xl bg-accent/5 flex items-center justify-center text-accent group-hover:scale-110 transition-transform">
                        <Lock className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-text-primary tracking-tight">Identity Credentials</p>
                        <p className="text-[11px] text-text-secondary font-medium">Update your account password and authentication keys.</p>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-text-secondary group-hover:translate-x-1 transition-transform" />
                  </button>

                  <button 
                    onClick={() => router.push('/settings/security')}
                    className="w-full flex items-center justify-between p-5 hover:bg-bg-subtle transition-all group text-left"
                  >
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-xl bg-accent/5 flex items-center justify-center text-accent group-hover:scale-110 transition-transform">
                        <Clock className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-text-primary tracking-tight">Access Session Log</p>
                        <p className="text-[11px] text-text-secondary font-medium">Audit currently active nodes and device sessions.</p>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-text-secondary group-hover:translate-x-1 transition-transform" />
                  </button>
                </div>
              </Card>
            </section>
          )}

        </div>
      </div>

      {/* Password Modal remains the same */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] animate-in fade-in duration-300">
          <Card className="border border-border bg-bg-surface p-8 w-full max-w-md shadow-2xl rounded-2xl animate-in zoom-in-95 duration-200">
            <div className="mb-6 space-y-1">
              <h3 className="text-xl font-bold text-text-primary tracking-tight">Modify Credentials</h3>
              <p className="text-[11px] text-text-secondary font-medium uppercase tracking-widest">Update Primary Access Key</p>
            </div>
            
            <div className="space-y-5">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-text-secondary uppercase tracking-[0.15em]">Current Key</label>
                <Input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="border-border bg-bg-subtle focus-visible:ring-accent rounded-xl h-11"
                  placeholder="••••••••"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-text-secondary uppercase tracking-[0.15em]">New Key</label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="border-border bg-bg-subtle focus-visible:ring-accent rounded-xl h-11"
                  placeholder="••••••••"
                />
                <p className="text-[9px] text-text-secondary italic font-medium">Requirement: Minimum 8 characters including alpha-numeric nodes.</p>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-text-secondary uppercase tracking-[0.15em]">Confirm New Key</label>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="border-border bg-bg-subtle focus-visible:ring-accent rounded-xl h-11"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-8">
              <Button
                variant="outline"
                className="flex-1 border-border text-text-secondary rounded-xl font-bold h-11"
                onClick={() => setShowPasswordModal(false)}
                disabled={changePasswordMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 bg-accent hover:bg-accent/90 text-white rounded-xl font-bold h-11 shadow-lg shadow-accent/20"
                onClick={handleChangePassword}
                disabled={changePasswordMutation.isPending}
              >
                {changePasswordMutation.isPending ? 'Verifying...' : 'Update Key'}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}