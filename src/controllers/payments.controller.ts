//@ts-nocheck
import { FastifyRequest, FastifyReply } from 'fastify';
import { handleError, badRequest } from '../utils/errors';
import * as paymentsService from '../services/payments.service';
import { UserRole } from '../types';

/**
 * Get payments based on user role
 */
export async function getPayments(
    request: FastifyRequest,
    reply: FastifyReply
) {
    try {
        const user = request.user;
        const payments = await paymentsService.getPaymentsByRole(user);

        return reply.code(200).send({
            payments,
            total: payments.length
        });
    } catch (error) {
        handleError(error, request, reply);
    }
}


export async function getSubscriptionPayments(request: FastifyRequest,
    reply: FastifyReply) {

    try {
        const user = request.user;
        const { id } = request.params
        const result = await paymentsService.getSubscriptionPayments(user, id);
        return reply.code(200).send({
            result,

        });

    } catch (e) {
        handleError(error, request, reply);
    }

}
/**
 * Get payment by ID
 */
export async function getPaymentById(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
) {
    try {
        const { id } = request.params;
        const user = request.user;

        const payment = await paymentsService.getPaymentById(id, user);

        return reply.code(200).send({ payment });
    } catch (error) {
        handleError(error, request, reply);
    }
}

/**
 * Get revenue list for admin with franchise and subscription details
 */
export async function getRevenueList(
    request: FastifyRequest<{
        Querystring: {
            franchiseId?: string;
            subscriptionId?: string;
            status?: string;
            fromDate?: string;
            toDate?: string;
            limit?: number;
            offset?: number;
        };
    }>,
    reply: FastifyReply
) {
    try {
        // Check if user is admin
        if (request.user.role !== UserRole.ADMIN) {
            throw badRequest('Only admins can access revenue data');
        }

        const { franchiseId, subscriptionId, status, fromDate, toDate, limit, offset } = request.query;

        // Validate pagination parameters
        if (limit && (limit < 1 || limit > 100)) {
            throw badRequest('Limit must be between 1 and 100');
        }

        if (offset && offset < 0) {
            throw badRequest('Offset must be non-negative');
        }

        const filters = {
            franchiseId,
            subscriptionId,
            status,
            fromDate,
            toDate,
            limit: limit ? Number(limit) : undefined,
            offset: offset ? Number(offset) : undefined
        };

        const result = await paymentsService.getRevenueListForAdmin(filters);

        return reply.code(200).send({
            success: true,
            ...result
        });
    } catch (error) {
        handleError(error, request, reply);
    }
}

/**
 * Get detailed revenue information for a specific payment
 */
export async function getRevenueDetails(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
) {
    try {
        // Check if user is admin
        if (request.user.role !== UserRole.ADMIN) {
            throw badRequest('Only admins can access revenue details');
        }

        const { id } = request.params;
        const revenueDetails = await paymentsService.getRevenueDetailsForAdmin(id);

        return reply.code(200).send({
            success: true,
            revenueDetails
        });
    } catch (error) {
        handleError(error, request, reply);
    }
}
