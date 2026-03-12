-- AI Agent interaction logs
-- Tracks every AI assistant request, tool call, and result per restaurant

CREATE TABLE IF NOT EXISTS ai_agent_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  user_message text NOT NULL,
  ai_response text,
  tool_called text,
  tool_params jsonb,
  tool_result jsonb,
  required_confirmation boolean NOT NULL DEFAULT false,
  confirmation_given boolean,
  execution_status text CHECK (execution_status IN
    ('success','failed','cancelled','pending_confirmation')),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ai_agent_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read own logs" ON ai_agent_logs FOR SELECT USING (
  EXISTS (SELECT 1 FROM restaurant_members
  WHERE restaurant_id = ai_agent_logs.restaurant_id
  AND user_id = auth.uid())
);

CREATE POLICY "members insert own logs" ON ai_agent_logs FOR INSERT
WITH CHECK (
  auth.uid() = user_id AND
  EXISTS (SELECT 1 FROM restaurant_members
  WHERE restaurant_id = ai_agent_logs.restaurant_id
  AND user_id = auth.uid())
);
