import type { GlobalConfig } from 'payload'

import { adminOnly } from '@/access/adminOnly'

/** Editable settings for the /shop page (title, intro, SEO, sort options, featured). */
export const Shop: GlobalConfig = {
  slug: 'shopSettings',
  label: 'Shop',
  access: {
    read: () => true,
    update: adminOnly,
  },
  admin: {
    group: 'Content',
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      defaultValue: 'Shop',
    },
    {
      name: 'intro',
      type: 'textarea',
      admin: { description: 'Optional text shown under the shop heading.' },
    },
    {
      name: 'featuredProducts',
      type: 'relationship',
      relationTo: 'products',
      hasMany: true,
      admin: { description: 'Pinned to the top of the shop (when no search/category filter).' },
    },
    {
      name: 'sortOptions',
      type: 'array',
      admin: { description: 'Sort choices shown to shoppers.' },
      fields: [
        { name: 'label', type: 'text', required: true },
        {
          name: 'value',
          type: 'text',
          admin: {
            description:
              'Leave blank for the default. Otherwise a sort field, e.g. title, -createdAt, priceInUSD, -priceInUSD',
          },
        },
      ],
      defaultValue: [
        { label: 'Alphabetic A-Z', value: '' },
        { label: 'Latest arrivals', value: '-createdAt' },
        { label: 'Price: Low to high', value: 'priceInUSD' },
        { label: 'Price: High to low', value: '-priceInUSD' },
      ],
    },
    {
      name: 'meta',
      type: 'group',
      label: 'SEO',
      fields: [
        { name: 'title', type: 'text' },
        { name: 'description', type: 'textarea' },
        { name: 'image', type: 'upload', relationTo: 'media' },
      ],
    },
  ],
}
