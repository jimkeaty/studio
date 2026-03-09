import AgentProfileForm from '@/components/admin/agents/AgentProfileForm';

export default function NewAgentPage() {
  return (
    <main className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">New Agent</h1>
        <p className="mt-2 text-sm text-gray-600">
          Create a new agent profile and commission setup.
        </p>
      </div>

      <AgentProfileForm />
    </main>
  );
}
