import TeamEditor from '@/components/admin/teams/TeamEditor';

type TeamPageProps = {
  params: Promise<{
    teamId: string;
  }>;
};

export default async function TeamDetailPage({ params }: TeamPageProps) {
  const { teamId } = await params;

  return (
    <main className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Team</h1>
        <p className="mt-2 text-sm text-gray-600">
          Editing team: {teamId}
        </p>
      </div>

      <TeamEditor teamId={teamId} />
    </main>
  );
}
