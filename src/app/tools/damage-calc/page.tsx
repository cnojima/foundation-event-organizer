import type { Metadata } from 'next'
import { DamageCalcClient } from './client'

export const metadata: Metadata = {
  title: 'Fleet Damage Calculator',
  description: 'Optimize your fleet configuration for Foundation: Galactic Frontier',
}

export default function DamageCalcPage() {
  return <DamageCalcClient />
}
