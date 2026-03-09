export function deriveAnniversary(startDate: string) {
  const date = new Date(`${startDate}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid startDate');
  }

  return {
    anniversaryMonth: date.getMonth() + 1,
    anniversaryDay: date.getDate(),
  };
}
