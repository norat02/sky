# Vercel custom domain and SSL notes

According to Vercel's official documentation:

- Add a domain from Project Settings -> Domains -> Add Domain.
- An apex domain such as `example.com` is configured with an A record; a subdomain such as `www.example.com` is configured with a CNAME record. The exact target values shown in the Vercel dashboard should be used.
- Vercel can also use its nameservers, especially for wildcard domains; existing DNS records must be recreated in Vercel when nameservers are changed.
- Vercel automatically attempts to generate a certificate for every added domain. Certificate issuance succeeds after DNS is added and propagated and the certificate validation challenge succeeds. Vercel uses Let's Encrypt for non-wildcard certificates and HTTPS then becomes active.

Sources:
- https://vercel.com/docs/domains/working-with-domains/add-a-domain
- https://vercel.com/docs/domains/working-with-ssl
