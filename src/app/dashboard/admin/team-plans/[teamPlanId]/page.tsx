import TeamPlanEditor from '@/components/admin/team-plans/TeamPlanEditor';

type TeamPlanPageProps = {
  params: Promise<{
    teamPlanId: string;
  }>;
};

export default async function TeamPlanDetailPage({
  params,
}: TeamPlanPageProps) {
  const { teamPlanId } = await params;

  return (
    <main className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Team Plan</h1>
        <p className="mt-2 text-sm text-gray-600">
          Editing team plan: {teamPlanId}
        </p>
      </div>

      <TeamPlanEditor teamPlanId={teamPlanId} />
    </main>
  );
}
