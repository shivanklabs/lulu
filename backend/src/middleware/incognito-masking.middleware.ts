export interface MaskedPatientView {
  pseudonym: string;
  isIncognito: true;
  age?: number;
  gender?: string;
  bloodGroup?: string;
  // Strictly no name, phone, email, or address
}

export const generateIncognitoPseudonym = (): string => {
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `#MB-${rand}`;
};

export const maskPatientPII = (
  patient: { dateOfBirth?: string; gender?: string; bloodGroup?: string },
  pseudonym: string
): MaskedPatientView => {
  let age: number | undefined;
  if (patient.dateOfBirth) {
    const birthYear = new Date(patient.dateOfBirth).getFullYear();
    const currentYear = new Date().getFullYear();
    if (!isNaN(birthYear)) {
      age = currentYear - birthYear;
    }
  }

  return {
    pseudonym,
    isIncognito: true,
    age,
    gender: patient.gender,
    bloodGroup: patient.bloodGroup,
  };
};
