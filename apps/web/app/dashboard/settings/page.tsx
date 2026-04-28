'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Bell, Lock, Eye, Clock, Zap, Volume2, Mail } from 'lucide-react';

interface NotificationSettings {
  email: boolean;
  taskAssigned: boolean;
  taskUpdated: boolean;
  slaBreached: boolean;
  interviewScheduled: boolean;
}

interface PreferenceSettings {
  theme: string;
  language: string;
  timeFormat: string;
}

export default function SettingsPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<NotificationSettings>({
    email: true,
    taskAssigned: true,
    taskUpdated: true,
    slaBreached: true,
    interviewScheduled: true,
  });

  const [preferences, setPreferences] = useState<PreferenceSettings>({
    theme: 'dark',
    language: 'en',
    timeFormat: '24h',
  });

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-text-primary">Settings</h1>
        <p className="mt-1 text-sm text-text-secondary">Manage your account preferences and notifications</p>
      </div>

      {/* Notification Preferences */}
      <Card className="border border-border bg-bg-surface p-6">
        <div className="mb-4 flex items-center gap-2">
          <Bell className="h-5 w-5 text-accent" />
          <h2 className="text-lg font-semibold text-text-primary">Notifications</h2>
        </div>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-text-primary">Email Notifications</p>
              <p className="text-sm text-text-secondary">Receive email updates for important events</p>
            </div>
            <Switch checked={notifications.email} onCheckedChange={(checked: boolean) => setNotifications({...notifications, email: checked})} />
          </div>

          {notifications.email && (
            <div className="ml-4 space-y-3 border-l border-border pl-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-text-primary">Task Assigned</p>
                  <p className="text-xs text-text-secondary">When a task is assigned to you</p>
                </div>
                <Switch checked={notifications.taskAssigned} onCheckedChange={(checked: boolean) => setNotifications({...notifications, taskAssigned: checked})} />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-text-primary">Task Updated</p>
                  <p className="text-xs text-text-secondary">When a task you watch is updated</p>
                </div>
                <Switch checked={notifications.taskUpdated} onCheckedChange={(checked: boolean) => setNotifications({...notifications, taskUpdated: checked})} />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-text-primary">SLA Breached</p>
                  <p className="text-xs text-text-secondary">When a task misses its deadline</p>
                </div>
                <Switch checked={notifications.slaBreached} onCheckedChange={(checked: boolean) => setNotifications({...notifications, slaBreached: checked})} />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-text-primary">Interview Scheduled</p>
                  <p className="text-xs text-text-secondary">For recruitment interview reminders</p>
                </div>
                <Switch checked={notifications.interviewScheduled} onCheckedChange={(checked: boolean) => setNotifications({...notifications, interviewScheduled: checked})} />
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Display Preferences */}
      <Card className="border border-border bg-bg-surface p-6">
        <div className="mb-4 flex items-center gap-2">
          <Eye className="h-5 w-5 text-accent" />
          <h2 className="text-lg font-semibold text-text-primary">Display</h2>
        </div>

        <div className="space-y-4">
          <div>
            <p className="mb-2 text-sm font-medium text-text-primary">Theme</p>
            <div className="inline-block rounded-md border border-border bg-bg-subtle p-1">
              <button className={`px-3 py-1 text-sm rounded ${preferences.theme === 'dark' ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary'}`} onClick={() => setPreferences({...preferences, theme: 'dark'})}>
                Dark
              </button>
            </div>
            <Badge className="ml-2 bg-bg-subtle text-text-secondary">Light mode not available</Badge>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-text-primary">Language</p>
            <Select value={preferences.language} onValueChange={(value) => setPreferences({...preferences, language: value})}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="es">Español</SelectItem>
                <SelectItem value="fr">Français</SelectItem>
                <SelectItem value="de">Deutsch</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-text-primary">Time Format</p>
            <Select value={preferences.timeFormat} onValueChange={(value) => setPreferences({...preferences, timeFormat: value})}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="24h">24-hour (14:30)</SelectItem>
                <SelectItem value="12h">12-hour (2:30 PM)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* Security Settings */}
      <Card className="border border-border bg-bg-surface p-6">
        <div className="mb-4 flex items-center gap-2">
          <Lock className="h-5 w-5 text-accent" />
          <h2 className="text-lg font-semibold text-text-primary">Security</h2>
        </div>

        <div className="space-y-3">
          <Button variant="outline" className="w-full justify-start border-border hover:bg-bg-elevated">
            <Lock className="mr-2 h-4 w-4" />
            Change Password
          </Button>
          <Button variant="outline" className="w-full justify-start border-border hover:bg-bg-elevated">
            <Zap className="mr-2 h-4 w-4" />
            Manage API Keys
          </Button>
          <Button variant="outline" className="w-full justify-start border-border hover:bg-bg-elevated" onClick={() => router.push('/settings/security')}>
            <Clock className="mr-2 h-4 w-4" />
            Active Sessions
          </Button>
        </div>
      </Card>

      {/* Save Button */}
      <div className="flex gap-2">
        <Button className="bg-accent hover:bg-accent-hover">Save Changes</Button>
        <Button variant="outline" className="border-border hover:bg-bg-elevated">Reset to Defaults</Button>
      </div>
    </div>
  );
}
