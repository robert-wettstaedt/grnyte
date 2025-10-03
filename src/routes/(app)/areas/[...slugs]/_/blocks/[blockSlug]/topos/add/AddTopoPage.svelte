<script lang="ts">
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import AppBar from '$lib/components/AppBar'
  import FileUpload from '$lib/components/FileUpload'
  import { enhanceWithFile } from '$lib/components/FileUpload/enhance.svelte'
  import FormActionBar from '$lib/components/FormActionBar'
  import { getBlockContext } from '$lib/contexts/block'
  import type { EnhanceState } from '$lib/forms/enhance.svelte'
  import { createAttachmentKey } from 'svelte/attachments'
  import { addTopo } from './page.remote'

  const a = addTopo[createAttachmentKey()]
  console.log(a)
  let attached = $state(false)

  const { block } = getBlockContext()

  let basePath = $derived(`/areas/${page.params.slugs}/_/blocks/${page.params.blockSlug}`)

  let state1 = $state<EnhanceState>({})
</script>

<svelte:head>
  <title>Edit topos of {block.name} - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<AppBar>
  {#snippet lead()}
    <span>Edit topos of</span>
    <a class="anchor" href={basePath}>{block.name}</a>
  {/snippet}
</AppBar>

<!-- onsubmit={(event) => {
    event.preventDefault()
    const form = event.target as HTMLFormElement
    const data = new FormData(form)
    enhanceWithFile(state)({
      data,
      form,
      submit: async () => {
        console.log(addTopo)
      },
    })
  }} -->
<form
  {@attach (element) => {
    type Listener<K extends keyof HTMLElementEventMap> = (this: HTMLFormElement, ev: HTMLElementEventMap[K]) => any
    const eventListenerList: Array<Listener<'submit'>> = []
    const addEventListener = element.__proto__.addEventListener as typeof element.addEventListener

    element.__proto__.addEventListener = <K extends keyof HTMLElementEventMap>(
      type: K,
      listener: Listener<K>,
      options?: boolean | AddEventListenerOptions,
    ) => {
      if (type === 'submit') {
        console.log('bla')
        eventListenerList.push(listener as Listener<'submit'>)
      } else {
        addEventListener(type, listener, options)
      }
    }

    addEventListener('submit', (event) => {
      event.preventDefault()

      const data = new FormData(element)
      enhanceWithFile(state1)({
        data,
        form: element,
        submit: async () => {
          eventListenerList.map((listener) => listener.call(element, event))
        },
      })
    })

    attached = true
  }}
  class="card preset-filled-surface-100-900 mt-8 p-2 md:p-4"
  enctype="multipart/form-data"
  {...attached ? addTopo : null}
>
  <FileUpload state={state1} accept="image/*" />

  <input type="hidden" name="redirect" value={page.url.searchParams.get('redirect') ?? ''} />
  <input type="hidden" name="blockId" value={block.id} />

  <p class="mt-8 text-sm text-gray-500">You can upload more topo images later.</p>

  <FormActionBar label="Add file" pending={addTopo.pending} />
</form>
