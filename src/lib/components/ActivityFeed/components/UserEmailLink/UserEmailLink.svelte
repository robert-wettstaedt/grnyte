<script lang="ts">
  interface Props {
    email: string
  }

  const { email }: Props = $props()
</script>

<a class="anchor" href={`mailto:${email}`}>{email}</a>
