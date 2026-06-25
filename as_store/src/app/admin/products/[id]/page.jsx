'use client'

import { useParams } from 'next/navigation'
import ProductEditor from '@/components/admin/ProductEditor.jsx'

export default function EditProductPage() {
  const { id } = useParams()
  return <ProductEditor id={id} />
}
