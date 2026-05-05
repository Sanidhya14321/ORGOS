-- Migration: Add assigned_position_id column to tasks table for new Position-based assignment model
-- This column replaces the fixed assigned_role field with dynamic position references

BEGIN;

-- Add assigned_position_id column to tasks table
-- This allows tasks to be assigned to specific positions instead of just role levels
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS assigned_position_id UUID REFERENCES public.positions(id) ON DELETE SET NULL;

-- Create index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_position_id ON public.tasks(assigned_position_id);

-- Create index for finding tasks assigned to positions within an org
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_position_org ON public.tasks(assigned_position_id)
  WHERE assigned_position_id IS NOT NULL;

COMMIT;
