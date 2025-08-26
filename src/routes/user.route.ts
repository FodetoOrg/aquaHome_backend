import { FastifyInstance } from "fastify";
import { getProfileDetails } from "../controllers/user.controller";
import { getProfileDetailsSchema } from "../schemas/user.schema";

export default async function (fastify: FastifyInstance) {
    // Profile details endpoint
    fastify.get(
        '/profile',
        {
            schema: getProfileDetailsSchema,
            preHandler: [fastify.authenticate],
        },
        (request, reply) => getProfileDetails(request as any, reply as any)
    );
}



