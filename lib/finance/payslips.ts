import { prisma } from "@/lib/prisma";

// Lectura de las tablas ya existentes en Neon. Son datos privados del usuario,
// sin generar proyecciones ni diagnósticos fiscales a partir de ellos.
type DbPayslip = {
  id: string;
  period_year: number;
  period_month: number;
  period_days: number;
  employer_name: string;
  gross_earnings: unknown;
  total_deductions: unknown;
  total_arrears: unknown;
  net_amount: unknown;
  irpf_base: unknown | null;
  irpf_rate: unknown | null;
  irpf_cash: unknown;
  irpf_in_kind: unknown;
  irpf_total: unknown;
  ss_base: unknown | null;
  ss_employee_total: unknown;
  ss_employee_arrears: unknown;
  ss_employer_total: unknown;
  employee_pension: unknown;
  employer_pension: unknown;
  employee_union: unknown;
  salary_advances: unknown;
  extra_pay: unknown;
  bonuses: unknown;
};

type DbItem = {
  payslip_id: string;
  position: number;
  section: string;
  code: string | null;
  description: string;
  units_or_rate: unknown | null;
  price_or_base: unknown | null;
  earnings: unknown;
  deductions: unknown;
  arrears: unknown;
  employer_amount: unknown | null;
  informative_amount: unknown | null;
};

const num = (v: unknown) => Number(v ?? 0);
const nullableNum = (v: unknown) => v === null || v === undefined ? null : Number(v);
const cents = (v: number) => Math.round(v * 100);

export async function payslipsView(userId: string) {
  const rows = await prisma.$queryRaw<DbPayslip[]>`
    SELECT id, period_year, period_month, period_days, employer_name,
           gross_earnings, total_deductions, total_arrears, net_amount,
           irpf_base, irpf_rate, irpf_cash, irpf_in_kind, irpf_total,
           ss_base, ss_employee_total, ss_employee_arrears, ss_employer_total,
           employee_pension, employer_pension, employee_union,
           salary_advances, extra_pay, bonuses
    FROM public.finance_payslips
    WHERE user_id = ${userId}::uuid
    ORDER BY period_year DESC, period_month DESC, created_at DESC
    LIMIT 120
  `;
  if (!rows.length) return { payslips: [] as Payslip[] };

  const details = await prisma.$queryRaw<DbItem[]>`
    SELECT i.payslip_id, i.position, i.section, i.code, i.description,
           i.units_or_rate, i.price_or_base, i.earnings, i.deductions,
           i.arrears, i.employer_amount, i.informative_amount
    FROM public.finance_payslip_items i
    JOIN public.finance_payslips p ON p.id = i.payslip_id
    WHERE p.user_id = ${userId}::uuid
    ORDER BY p.period_year DESC, p.period_month DESC, i.position ASC
    LIMIT 5000
  `;
  const byPayslip = new Map<string, PayslipItem[]>();
  for (const row of details) {
    const items = byPayslip.get(row.payslip_id) ?? [];
    items.push({
      position: row.position,
      section: row.section as PayslipItem["section"],
      code: row.code,
      description: row.description,
      unitsOrRate: nullableNum(row.units_or_rate),
      priceOrBase: nullableNum(row.price_or_base),
      earnings: num(row.earnings),
      deductions: num(row.deductions),
      arrears: num(row.arrears),
      employerAmount: nullableNum(row.employer_amount),
      informativeAmount: nullableNum(row.informative_amount),
    });
    byPayslip.set(row.payslip_id, items);
  }

  return {
    payslips: rows.map((r): Payslip => {
      const items = byPayslip.get(r.id) ?? [];
      const employee = items.filter((i) => i.section === "employee");
      const employer = items.filter((i) => i.section === "employer_social_security");
      const gross = num(r.gross_earnings);
      const deductions = num(r.total_deductions);
      const arrears = num(r.total_arrears);
      const net = num(r.net_amount);
      const ssEmployer = num(r.ss_employer_total);
      const anomalies: string[] = [];
      const check = (actual: number, expected: number, label: string) => {
        if (cents(actual) !== cents(expected)) anomalies.push(`${label}: el desglose no coincide con el total.`);
      };
      check(employee.reduce((s, i) => s + i.earnings, 0), gross, "Devengos");
      check(employee.reduce((s, i) => s + i.deductions, 0), deductions, "Deducciones");
      check(employee.reduce((s, i) => s + i.arrears, 0), arrears, "Atrasos");
      check(employer.reduce((s, i) => s + (i.employerAmount ?? 0), 0), ssEmployer, "Seguridad Social de la empresa");
      check(gross - deductions + arrears, net, "Líquido a percibir");
      check(num(r.irpf_cash) + num(r.irpf_in_kind), num(r.irpf_total), "IRPF");

      return {
        id: r.id,
        year: r.period_year,
        month: r.period_month,
        days: r.period_days,
        employer: r.employer_name,
        gross,
        deductions,
        arrears,
        net,
        irpfBase: nullableNum(r.irpf_base),
        irpfRate: nullableNum(r.irpf_rate),
        irpfCash: num(r.irpf_cash),
        irpfInKind: num(r.irpf_in_kind),
        irpfTotal: num(r.irpf_total),
        ssBase: nullableNum(r.ss_base),
        ssEmployee: num(r.ss_employee_total) - num(r.ss_employee_arrears),
        ssEmployer,
        employeePension: num(r.employee_pension),
        employerPension: num(r.employer_pension),
        union: num(r.employee_union),
        advances: num(r.salary_advances),
        extraPay: num(r.extra_pay),
        bonuses: num(r.bonuses),
        items,
        anomalies,
      };
    }),
  };
}

export type PayslipItem = {
  position: number;
  section: "employee" | "employer_social_security" | "informative";
  code: string | null;
  description: string;
  unitsOrRate: number | null;
  priceOrBase: number | null;
  earnings: number;
  deductions: number;
  arrears: number;
  employerAmount: number | null;
  informativeAmount: number | null;
};

export type Payslip = {
  id: string;
  year: number;
  month: number;
  days: number;
  employer: string;
  gross: number;
  deductions: number;
  arrears: number;
  net: number;
  irpfBase: number | null;
  irpfRate: number | null;
  irpfCash: number;
  irpfInKind: number;
  irpfTotal: number;
  ssBase: number | null;
  ssEmployee: number;
  ssEmployer: number;
  employeePension: number;
  employerPension: number;
  union: number;
  advances: number;
  extraPay: number;
  bonuses: number;
  items: PayslipItem[];
  anomalies: string[];
};
