import TeamPlanForm from '@/components/admin/team-plans/TeamPlanForm';

export default function NewTeamPlanPage() {
  return (
    <main className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">New Team Plan</h1>
        <p className="mt-2 text-sm text-gray-600">
          Create a reusable default commission structure for a team.
        </p>
      </div>

      <TeamPlanForm submitLabel="Create Team Plan" />
    </main>
  );
}
