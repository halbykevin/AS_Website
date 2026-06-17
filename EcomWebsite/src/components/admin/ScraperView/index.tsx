import type { AdminViewServerProps } from 'payload'
import React from 'react'
import { DefaultTemplate } from '@payloadcms/next/templates'
import { Gutter } from '@payloadcms/ui'

import { ScraperClient } from './Client'

/** Custom admin view at /admin/scraper — renders inside the normal admin shell. */
const ScraperView: React.FC<AdminViewServerProps> = ({
  initPageResult,
  params,
  searchParams,
}) => {
  return (
    <DefaultTemplate
      i18n={initPageResult.req.i18n}
      locale={initPageResult.locale}
      params={params}
      payload={initPageResult.req.payload}
      permissions={initPageResult.permissions}
      searchParams={searchParams}
      user={initPageResult.req.user ?? undefined}
      visibleEntities={initPageResult.visibleEntities}
    >
      <Gutter>
        <ScraperClient />
      </Gutter>
    </DefaultTemplate>
  )
}

export default ScraperView
