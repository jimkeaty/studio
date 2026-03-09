import AgentProfileEditor from '@/components/admin/agents/AgentProfileEditor';

type AgentPageProps = {
  params: Promise<{
    agentId: string;
  }>;
};

export default async function AgentDetailPage({ params }: AgentPageProps) {
  const { agentId } = await params;

  return (
    <main className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Agent Profile</h1>
        <p className="mt-2 text-sm text-gray-600">
          Editing agent: {agentId}
        </p>
      </div>

      <AgentProfileEditor agentId={agentId} />
    </main>
  );
}
